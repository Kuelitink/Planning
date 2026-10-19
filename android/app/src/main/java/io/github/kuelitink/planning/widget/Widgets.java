package io.github.kuelitink.planning.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import io.github.kuelitink.planning.MainActivity;
import java.util.Calendar;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Mise à jour des deux widgets et liens vers l'appli.
 *
 * Les appuis qui ouvrent l'appli passent par une adresse `planning-widget://…` (ouvrir une fiche,
 * nouvelle tâche, checklist du jour), lue par `PlanningWidgetsPlugin`. Cocher une case ne l'ouvre
 * pas : c'est une diffusion reçue par `TodayWidget`, qui note l'action et redessine.
 */
public final class Widgets {

    static final String ACTION_OPEN = "io.github.kuelitink.planning.WIDGET";
    static final String ACTION_TOGGLE = "io.github.kuelitink.planning.widget.TOGGLE";
    static final String ACTION_REFRESH = "io.github.kuelitink.planning.widget.REFRESH";
    static final String SCHEME = "planning-widget";

    private Widgets() {}

    /** Redessine tous les widgets posés et prévoit le prochain rafraîchissement. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        long now = System.currentTimeMillis();
        Snapshot snapshot = WidgetStore.snapshot(context);
        int[] today = manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class));
        int[] next = manager.getAppWidgetIds(new ComponentName(context, NextWidget.class));
        for (int id : today) manager.updateAppWidget(id, WidgetRenderer.today(context, snapshot, manager.getAppWidgetOptions(id), now));
        for (int id : next) manager.updateAppWidget(id, WidgetRenderer.next(context, snapshot, now));
        scheduleRefresh(context, snapshot, now, today.length + next.length > 0);
    }

    /**
     * Prochain changement visible : début ou fin d'un élément du jour, sinon minuit. Alarme non
     * exacte (pas de permission) : Android peut la décaler un peu, le rafraîchissement toutes les
     * 30 min des widgets sert de filet.
     */
    private static void scheduleRefresh(Context context, Snapshot snapshot, long now, boolean any) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent refresh = PendingIntent.getBroadcast(
            context,
            0,
            new Intent(context, TodayWidget.class).setAction(ACTION_REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (!any) {
            alarms.cancel(refresh);
            return;
        }
        Calendar midnight = Calendar.getInstance();
        midnight.setTimeInMillis(now);
        midnight.add(Calendar.DAY_OF_MONTH, 1);
        midnight.set(Calendar.HOUR_OF_DAY, 0);
        midnight.set(Calendar.MINUTE, 0);
        midnight.set(Calendar.SECOND, 5);
        long at = midnight.getTimeInMillis();
        Snapshot.Day day = snapshot.day(WidgetRenderer.isoDate(now));
        if (day != null) {
            for (Snapshot.Item item : day.items) {
                if (item.allDay) continue;
                if (item.start > now) at = Math.min(at, item.start);
                else if (item.end > now) at = Math.min(at, item.end);
            }
        }
        alarms.set(AlarmManager.RTC, at, refresh);
    }

    /** Appui qui ouvre l'appli : `open/task/<id>`, `open/event/<id>`, `add`, `today`. */
    static PendingIntent open(Context context, String path) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(ACTION_OPEN)
            .setData(Uri.parse(SCHEME + "://" + path))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openItem(Context context, Snapshot.Item item) {
        return open(context, "open/" + (item.isTask() ? "task" : "event") + "/" + Uri.encode(item.id));
    }

    /** Cocher (`done` = true) ou décocher une tâche, sans ouvrir l'appli. */
    static PendingIntent toggle(Context context, String id, boolean done) {
        Intent intent = new Intent(context, TodayWidget.class)
            .setAction(ACTION_TOGGLE)
            .setData(Uri.parse(SCHEME + "://toggle/" + Uri.encode(id) + "?done=" + (done ? 1 : 0)));
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Action pour l'appli (même forme que `WidgetAction` dans src/native/widgets.ts), d'après l'adresse. */
    static JSONObject actionFromUri(Uri uri) {
        if (uri == null || !SCHEME.equals(uri.getScheme())) return null;
        try {
            String host = uri.getHost();
            if ("add".equals(host)) return new JSONObject().put("type", "add");
            if ("today".equals(host)) return new JSONObject().put("type", "today");
            if ("open".equals(host) && uri.getPathSegments().size() == 2) {
                String kind = uri.getPathSegments().get(0);
                if (!"task".equals(kind) && !"event".equals(kind)) return null;
                return new JSONObject().put("type", "open").put("kind", kind).put("id", uri.getPathSegments().get(1));
            }
        } catch (JSONException e) {
            return null;
        }
        return null;
    }
}
