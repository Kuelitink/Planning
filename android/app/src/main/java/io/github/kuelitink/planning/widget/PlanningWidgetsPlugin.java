package io.github.kuelitink.planning.widget;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import org.json.JSONException;
import org.json.JSONObject;

/** Lien entre l'appli (src/native/widgets.ts) et les widgets. */
@CapacitorPlugin(name = "PlanningWidgets")
public class PlanningWidgetsPlugin extends Plugin {

    private static WeakReference<PlanningWidgetsPlugin> current = new WeakReference<>(null);

    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    /** Prévient l'appli, si elle tourne, qu'une action attend. */
    static void notifyActions() {
        PlanningWidgetsPlugin plugin = current.get();
        if (plugin != null) plugin.notifyListeners("actions", new JSObject());
    }

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("Instantané manquant");
            return;
        }
        WidgetStore.setSnapshot(getContext(), json);
        Widgets.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeActions(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("actions", new JSArray(WidgetStore.takeActions(getContext()).toString()));
            call.resolve(result);
        } catch (JSONException e) {
            call.reject("Actions illisibles", e);
        }
    }

    /** Appli ouverte depuis un widget (au démarrage comme quand elle tourne déjà). */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (!Widgets.ACTION_OPEN.equals(intent.getAction())) return;
        JSONObject action = Widgets.actionFromUri(intent.getData());
        // Une seule fois, même si l'activité est recréée avec la même intention.
        intent.setAction(Intent.ACTION_MAIN).setData(null);
        if (action == null) return;
        WidgetStore.addAction(getContext(), action);
        notifyListeners("actions", new JSObject());
    }
}
