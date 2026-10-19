package io.github.kuelitink.planning.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.content.ContextCompat;
import io.github.kuelitink.planning.R;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Dessin des widgets à partir de l'instantané, pour l'heure `now`. */
final class WidgetRenderer {

    /** Hauteur d'une ligne (40 dp) et de son espacement (6 dp). */
    private static final int ROW_DP = 46;
    /** En-tête et marges du widget « Aujourd'hui ». */
    private static final int CHROME_DP = 80;

    private WidgetRenderer() {}

    static String isoDate(long ms) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date(ms));
    }

    private static String hm(long ms) {
        return new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date(ms));
    }

    /** « lun. 19 oct. » */
    private static String dayLabel(long ms) {
        return new SimpleDateFormat("EEE d MMM", Locale.FRANCE).format(new Date(ms));
    }

    private static String plural(int n, String one, String many) {
        return n + " " + (n > 1 ? many : one);
    }

    /** Éléments du jour encore utiles : journée entière, tâches (même en retard), événements pas finis. */
    private static List<Snapshot.Item> visible(Snapshot.Day day, long now) {
        List<Snapshot.Item> out = new ArrayList<>();
        for (Snapshot.Item item : day.items) {
            if (item.isTask() || item.allDay || item.end > now) out.add(item);
        }
        return out;
    }

    // --- « Aujourd'hui » ---------------------------------------------------------------

    static RemoteViews today(Context context, Snapshot snapshot, Bundle options, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        views.setOnClickPendingIntent(R.id.header, Widgets.open(context, "today"));
        views.setOnClickPendingIntent(R.id.add, Widgets.open(context, "add"));
        views.setOnClickPendingIntent(R.id.message, Widgets.open(context, "today"));
        views.setOnClickPendingIntent(R.id.more, Widgets.open(context, "today"));
        views.removeAllViews(R.id.list);
        views.setViewVisibility(R.id.more, View.GONE);

        Snapshot.Day day = snapshot.day(isoDate(now));
        if (day == null) {
            views.setTextViewText(R.id.subtitle, dayLabel(now));
            views.setTextViewText(R.id.message, context.getString(R.string.widget_stale));
            views.setViewVisibility(R.id.message, View.VISIBLE);
            return views;
        }

        List<Snapshot.Item> items = visible(day, now);
        Set<String> todo = new HashSet<>();
        Set<String> checked = new HashSet<>();
        for (Snapshot.Item item : day.items) {
            if (!item.isTask()) continue;
            if (item.done) checked.add(item.id);
            else todo.add(item.id);
        }
        String subtitle = dayLabel(now) + " · " + plural(todo.size(), "à faire", "à faire");
        int done = day.done + checked.size();
        if (done > 0) subtitle += " · " + plural(done, "faite", "faites");
        views.setTextViewText(R.id.subtitle, subtitle);

        if (items.isEmpty()) {
            views.setTextViewText(R.id.message, context.getString(R.string.widget_empty));
            views.setViewVisibility(R.id.message, View.VISIBLE);
            return views;
        }
        views.setViewVisibility(R.id.message, View.GONE);

        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        int rows = height > 0 ? Math.max(1, (height - CHROME_DP) / ROW_DP) : 4;
        int shown = items.size() <= rows ? items.size() : Math.max(1, rows - 1);
        for (int i = 0; i < shown; i++) views.addView(R.id.list, row(context, items.get(i)));
        if (shown < items.size()) {
            int rest = items.size() - shown;
            views.setTextViewText(R.id.more, "+ " + plural(rest, "autre", "autres"));
            views.setViewVisibility(R.id.more, View.VISIBLE);
        }
        return views;
    }

    private static RemoteViews row(Context context, Snapshot.Item item) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_row);
        String title = item.part != null ? item.title + " (" + item.part + ")" : item.title;
        row.setOnClickPendingIntent(R.id.row, Widgets.openItem(context, item));
        if (item.isTask()) {
            check(row, item);
            row.setOnClickPendingIntent(R.id.check_area, Widgets.toggle(context, item.id, !item.done));
            row.setInt(R.id.dot_fill, "setColorFilter", item.color);
            row.setTextViewText(R.id.row_time, hm(item.start));
            if (item.done) {
                SpannableString struck = new SpannableString(title);
                struck.setSpan(new StrikethroughSpan(), 0, title.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                row.setTextViewText(R.id.row_title, struck);
                row.setTextColor(R.id.row_title, ContextCompat.getColor(context, R.color.planning_faint));
            } else {
                row.setTextViewText(R.id.row_title, title);
            }
        } else {
            row.setInt(R.id.row, "setBackgroundResource", R.drawable.widget_row_event_bg);
            row.setViewVisibility(R.id.check_box, View.GONE);
            row.setViewVisibility(R.id.event_mark, View.VISIBLE);
            row.setViewVisibility(R.id.dot, View.GONE);
            row.setTextViewText(R.id.row_title, title);
            row.setTextViewText(R.id.row_time, item.allDay ? "Journée" : hm(item.start));
        }
        return row;
    }

    /** Case : contour à la couleur de la priorité, pleine avec une coche blanche si faite. */
    private static void check(RemoteViews views, Snapshot.Item item) {
        views.setImageViewResource(R.id.check_box, item.done ? R.drawable.widget_box_on : R.drawable.widget_box_off);
        views.setInt(R.id.check_box, "setColorFilter", item.ring);
        views.setViewVisibility(R.id.check_tick, item.done ? View.VISIBLE : View.GONE);
    }

    // --- « Prochaine tâche » -----------------------------------------------------------

    static RemoteViews next(Context context, Snapshot snapshot, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_next);
        views.setOnClickPendingIntent(R.id.widget_root, Widgets.open(context, "today"));
        views.setViewVisibility(R.id.check_area, View.GONE);

        Snapshot.Day day = snapshot.day(isoDate(now));
        if (day == null) {
            views.setTextViewText(R.id.label, dayLabel(now).toUpperCase(Locale.FRANCE));
            views.setTextViewText(R.id.title, context.getString(R.string.widget_stale));
            views.setTextViewText(R.id.meta, "");
            return views;
        }

        Snapshot.Item current = null;
        Snapshot.Item upcoming = null;
        for (Snapshot.Item item : day.items) {
            if (item.allDay || item.done || item.end <= now) continue;
            if (item.start <= now) {
                // En cours : une tâche passe avant un événement qui la recouvre.
                if (current == null || (item.isTask() && !current.isTask())) current = item;
            } else if (upcoming == null) {
                upcoming = item;
            }
        }

        Snapshot.Item shown = current != null ? current : upcoming;
        String label;
        if (current != null) {
            label = context.getString(R.string.widget_now) + " · JUSQU'À " + hm(current.end);
        } else if (upcoming != null) {
            label = "À SUIVRE · " + hm(upcoming.start);
        } else {
            // Plus rien aujourd'hui : le premier élément de demain.
            Calendar tomorrow = Calendar.getInstance();
            tomorrow.setTimeInMillis(now);
            tomorrow.add(Calendar.DAY_OF_MONTH, 1);
            Snapshot.Day next = snapshot.day(isoDate(tomorrow.getTimeInMillis()));
            if (next != null) {
                for (Snapshot.Item item : next.items) {
                    if (!item.allDay && !item.done) {
                        shown = item;
                        break;
                    }
                }
            }
            if (shown == null) {
                views.setTextViewText(R.id.label, "AUJOURD'HUI");
                views.setTextViewText(R.id.title, "Rien d'autre de prévu");
                views.setTextViewText(R.id.meta, plural(day.done, "tâche faite", "tâches faites"));
                return views;
            }
            label = "DEMAIN · " + hm(shown.start);
        }

        String title = shown.part != null ? shown.title + " (" + shown.part + ")" : shown.title;
        views.setTextViewText(R.id.label, label);
        views.setTextViewText(R.id.title, title);
        views.setTextViewText(R.id.meta, hm(shown.start) + " – " + hm(shown.end) + (shown.isTask() ? "" : " · événement"));
        views.setOnClickPendingIntent(R.id.widget_root, Widgets.openItem(context, shown));
        if (shown.isTask()) {
            views.setViewVisibility(R.id.check_area, View.VISIBLE);
            check(views, shown);
            views.setOnClickPendingIntent(R.id.check_area, Widgets.toggle(context, shown.id, true));
        }
        return views;
    }
}
