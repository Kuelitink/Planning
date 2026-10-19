package io.github.kuelitink.planning.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Widget « Aujourd'hui ». Reçoit aussi, pour les deux widgets, les cases cochées et l'alarme de
 * rafraîchissement.
 */
public class TodayWidget extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Widgets.ACTION_TOGGLE.equals(action)) {
            Uri uri = intent.getData();
            String id = uri == null ? null : uri.getLastPathSegment();
            if (id != null) {
                WidgetStore.setDone(context, id, "1".equals(uri.getQueryParameter("done")));
                Widgets.updateAll(context);
                PlanningWidgetsPlugin.notifyActions();
            }
            return;
        }
        if (Widgets.ACTION_REFRESH.equals(action)) {
            Widgets.updateAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        Widgets.updateAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        Widgets.updateAll(context);
    }
}
