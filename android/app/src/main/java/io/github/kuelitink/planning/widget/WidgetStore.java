package io.github.kuelitink.planning.widget;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Données des widgets, dans les préférences de l'appli :
 * - l'instantané envoyé par l'appli (src/native/widgets.ts, `WidgetSnapshot`) ;
 * - la file des actions faites sur les widgets, que l'appli lit avec `takeActions` ;
 * - les cases cochées sur un widget en attendant que l'appli les applique (pour un affichage immédiat).
 */
final class WidgetStore {

    private static final String PREFS = "planning_widgets";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_ACTIONS = "actions";
    private static final String KEY_DONE = "done";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject object(SharedPreferences p, String key) {
        try {
            return new JSONObject(p.getString(key, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static JSONArray array(SharedPreferences p, String key) {
        try {
            return new JSONArray(p.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** Nouvel instantané : on oublie les cases cochées que l'appli a déjà prises en compte. */
    static synchronized void setSnapshot(Context context, String json) {
        SharedPreferences p = prefs(context);
        Set<String> pending = new HashSet<>();
        JSONArray actions = array(p, KEY_ACTIONS);
        for (int i = 0; i < actions.length(); i++) {
            JSONObject a = actions.optJSONObject(i);
            if (a != null && "done".equals(a.optString("type"))) pending.add(a.optString("id"));
        }
        JSONObject done = object(p, KEY_DONE);
        for (Iterator<String> it = done.keys(); it.hasNext(); ) {
            if (!pending.contains(it.next())) it.remove();
        }
        p.edit().putString(KEY_SNAPSHOT, json).putString(KEY_DONE, done.toString()).apply();
    }

    static Snapshot snapshot(Context context) {
        SharedPreferences p = prefs(context);
        return Snapshot.parse(p.getString(KEY_SNAPSHOT, null), object(p, KEY_DONE));
    }

    static synchronized void addAction(Context context, JSONObject action) {
        SharedPreferences p = prefs(context);
        JSONArray actions = array(p, KEY_ACTIONS);
        actions.put(action);
        p.edit().putString(KEY_ACTIONS, actions.toString()).apply();
    }

    /** Case cochée ou décochée sur un widget. */
    static synchronized void setDone(Context context, String id, boolean value) {
        SharedPreferences p = prefs(context);
        JSONObject done = object(p, KEY_DONE);
        try {
            done.put(id, value);
            JSONObject action = new JSONObject()
                .put("type", "done")
                .put("id", id)
                .put("done", value)
                .put("at", System.currentTimeMillis());
            JSONArray actions = array(p, KEY_ACTIONS);
            actions.put(action);
            p.edit().putString(KEY_DONE, done.toString()).putString(KEY_ACTIONS, actions.toString()).apply();
        } catch (JSONException e) {
            // Identifiant illisible : rien à enregistrer.
        }
    }

    static synchronized JSONArray takeActions(Context context) {
        SharedPreferences p = prefs(context);
        JSONArray actions = array(p, KEY_ACTIONS);
        p.edit().remove(KEY_ACTIONS).apply();
        return actions;
    }
}
