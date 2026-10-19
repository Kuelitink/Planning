package io.github.kuelitink.planning.widget;

import android.graphics.Color;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Instantané envoyé par l'appli (même forme que `WidgetSnapshot` dans src/native/widgets.ts). */
final class Snapshot {

    static final class Item {
        String kind;
        String id;
        String title;
        long start;
        long end;
        boolean allDay;
        /** Pastille de la liste ; 0 = aucune (événement). */
        int color;
        int ring;
        String part;
        /** Cochée sur un widget, en attendant l'appli. */
        boolean done;

        boolean isTask() {
            return "task".equals(kind);
        }
    }

    static final class Day {
        String date;
        final List<Item> items = new ArrayList<>();
        int done;
    }

    final List<Day> days = new ArrayList<>();

    /** Le jour `date` (`YYYY-MM-DD`), ou `null` si l'instantané ne va pas jusque-là. */
    Day day(String date) {
        for (Day d : days) if (d.date.equals(date)) return d;
        return null;
    }

    static Snapshot parse(String json, JSONObject doneOverrides) {
        Snapshot s = new Snapshot();
        if (json == null) return s;
        try {
            JSONArray days = new JSONObject(json).getJSONArray("days");
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.getJSONObject(i);
                Day day = new Day();
                day.date = d.getString("date");
                day.done = d.optInt("done");
                JSONArray items = d.getJSONArray("items");
                for (int j = 0; j < items.length(); j++) {
                    JSONObject o = items.getJSONObject(j);
                    Item item = new Item();
                    item.kind = o.getString("kind");
                    item.id = o.getString("id");
                    item.title = o.optString("title");
                    item.start = o.getLong("start");
                    item.end = o.getLong("end");
                    item.allDay = o.optBoolean("allDay");
                    item.color = color(o.optString("color", null));
                    item.ring = color(o.optString("ring", null));
                    item.part = o.optString("part", null);
                    item.done = doneOverrides.optBoolean(item.id, false);
                    day.items.add(item);
                }
                s.days.add(day);
            }
        } catch (JSONException e) {
            s.days.clear();
        }
        return s;
    }

    private static int color(String hex) {
        if (hex == null || hex.isEmpty()) return 0;
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return 0;
        }
    }
}
