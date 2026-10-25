package io.github.kuelitink.planning;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Mise à jour de l'appli (src/native/update.ts) : télécharge la nouvelle APK dans le cache de
 * l'appli puis ouvre l'installateur d'Android. Passer par Chrome ne marche pas : il bloque les
 * APK téléchargées depuis un onglet ouvert par une autre appli, sans laisser de fichier.
 */
@CapacitorPlugin(name = "ApkUpdate")
public class ApkUpdatePlugin extends Plugin {

    private static final String APK_TYPE = "application/vnd.android.package-archive";
    private static final int MAX_REDIRECTS = 5;

    /** Android autorise-t-il Planning à installer des applis ? */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canRequestInstalls());
        call.resolve(result);
    }

    /** Ouvre le réglage « Installer des applis inconnues » de Planning. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Télécharge l'APK (`url`, en https) puis lance son installation. Avancée : événement « progress ». */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Lien de téléchargement invalide");
            return;
        }
        new Thread(() -> {
            try {
                File apk = download(url);
                install(apk);
                call.resolve();
            } catch (Exception e) {
                call.reject("Téléchargement impossible", e);
            }
        }).start();
    }

    private boolean canRequestInstalls() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File download(String address) throws IOException {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Dossier de téléchargement impossible à créer");
        File part = new File(dir, "planning.apk.part");
        File apk = new File(dir, "planning.apk");

        // GitHub redirige vers son stockage de fichiers : on suit les redirections.
        URL url = new URL(address);
        HttpURLConnection conn = null;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(30_000);
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                conn = null;
                if (location == null) throw new IOException("Redirection sans adresse");
                url = new URL(url, location);
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect();
                throw new IOException("Réponse HTTP " + code);
            }
            break;
        }
        if (conn == null) throw new IOException("Trop de redirections");

        try {
            long total = conn.getContentLengthLong();
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[64 * 1024];
                long done = 0;
                int lastPercent = -1;
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    done += n;
                    if (total <= 0) continue;
                    int percent = (int) (done * 100 / total);
                    if (percent == lastPercent) continue;
                    lastPercent = percent;
                    JSObject progress = new JSObject();
                    progress.put("percent", percent);
                    notifyListeners("progress", progress);
                }
            }
        } finally {
            conn.disconnect();
        }
        if (apk.exists() && !apk.delete()) throw new IOException("Ancienne APK impossible à remplacer");
        if (!part.renameTo(apk)) throw new IOException("APK impossible à enregistrer");
        return apk;
    }

    private void install(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, APK_TYPE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
