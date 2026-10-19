package io.github.kuelitink.planning.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget « Prochaine tâche » (les cases cochées passent par `TodayWidget`). */
public class NextWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        Widgets.updateAll(context);
    }
}
