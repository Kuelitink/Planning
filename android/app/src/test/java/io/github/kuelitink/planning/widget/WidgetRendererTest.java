package io.github.kuelitink.planning.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import io.github.kuelitink.planning.R;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

/**
 * Widgets dessinés pour de vrai (Robolectric) : les vues doivent se construire sans erreur (sinon
 * le téléphone affiche « Impossible de charger le widget ») et montrer la bonne journée. Les images
 * sont écrites dans app/build/widget-previews/ pour les regarder.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class WidgetRendererTest {

    private Context context;
    /** Lundi 19 octobre 2026, 10:40 (Paris). */
    private long now;

    private static long at(int day, int hour, int minute) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(2026, Calendar.OCTOBER, day, hour, minute);
        return c.getTimeInMillis();
    }

    private static JSONObject task(String id, String title, long start, long end, String color, String ring) throws Exception {
        return new JSONObject()
            .put("kind", "task")
            .put("id", id)
            .put("title", title)
            .put("start", start)
            .put("end", end)
            .put("allDay", false)
            .put("color", color)
            .put("ring", ring);
    }

    private static JSONObject event(String id, String title, long start, long end, boolean allDay) throws Exception {
        return new JSONObject().put("kind", "event").put("id", id).put("title", title).put("start", start).put("end", end).put("allDay", allDay);
    }

    private static String snapshot() throws Exception {
        JSONArray today = new JSONArray()
            .put(event("ferie", "Anniversaire de Léa", at(19, 0, 0), at(20, 0, 0), true))
            .put(task("rapport", "Rapport trimestriel", at(19, 9, 0), at(19, 10, 30), "#3D6FE0", "#D7263D"))
            .put(event("reunion", "Réunion d'équipe", at(19, 10, 30), at(19, 11, 0), false))
            .put(task("mails", "Répondre aux mails", at(19, 11, 0), at(19, 11, 30), "#1F9E6B", "#E07A00"))
            .put(task("maquette", "Maquette du site", at(19, 14, 0), at(19, 15, 30), "#7A4BD6", "#8A4D66").put("part", "1/2"))
            .put(event("dentiste", "Dentiste", at(19, 17, 0), at(19, 17, 45), false))
            .put(task("courses", "Courses", at(19, 18, 0), at(19, 18, 30), "#E07024", "#B98AA0"));
        JSONArray tomorrow = new JSONArray().put(task("maquette", "Maquette du site", at(20, 9, 0), at(20, 9, 30), "#7A4BD6", "#8A4D66").put("part", "2/2"));
        JSONArray days = new JSONArray()
            .put(new JSONObject().put("date", "2026-10-19").put("items", today).put("done", 2))
            .put(new JSONObject().put("date", "2026-10-20").put("items", tomorrow).put("done", 0));
        return new JSONObject().put("version", 1).put("generatedAt", at(19, 10, 0)).put("days", days).toString();
    }

    @Before
    public void setUp() throws Exception {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Paris"));
        context = RuntimeEnvironment.getApplication();
        now = at(19, 10, 40);
        WidgetStore.setSnapshot(context, snapshot());
    }

    private static Bundle size(int widthDp, int heightDp) {
        Bundle options = new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, widthDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, widthDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, heightDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, heightDp);
        return options;
    }

    /** Construit les vues comme le lanceur, et écrit l'image du widget. */
    private View apply(RemoteViews views, int widthDp, int heightDp, String name) throws Exception {
        float density = context.getResources().getDisplayMetrics().density;
        int w = Math.round(widthDp * density);
        int h = Math.round(heightDp * density);
        FrameLayout parent = new FrameLayout(context);
        View view = views.apply(context, parent);
        parent.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        parent.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        parent.layout(0, 0, w, h);
        int pad = Math.round(16 * density);
        Bitmap bitmap = Bitmap.createBitmap(w + 2 * pad, h + 2 * pad, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.rgb(0x5B, 0x6E, 0x8C)); // fond d'écran
        canvas.translate(pad, pad);
        parent.draw(canvas);
        File dir = new File("build/widget-previews");
        dir.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        return view;
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    @Test
    public void aujourdhui() throws Exception {
        Snapshot s = WidgetStore.snapshot(context);
        View view = apply(WidgetRenderer.today(context, s, size(320, 300), now), 320, 300, "aujourdhui");
        assertEquals("lun. 19 oct. · 4 à faire · 2 faites", text(view, R.id.subtitle));
        // 300 dp : 4 lignes, dont la dernière remplacée par « + 4 autres » (réunion finie ? non : en cours).
        ViewGroup list = view.findViewById(R.id.list);
        assertEquals(3, list.getChildCount());
        assertEquals("+ 4 autres", text(view, R.id.more));
        assertEquals("Anniversaire de Léa", text(list.getChildAt(0), R.id.row_title));
        assertEquals("Journée", text(list.getChildAt(0), R.id.row_time));
        assertEquals("Rapport trimestriel", text(list.getChildAt(1), R.id.row_title));
        assertEquals("09:00", text(list.getChildAt(1), R.id.row_time));
    }

    @Test
    public void aujourdhuiGrand() throws Exception {
        Snapshot s = WidgetStore.snapshot(context);
        View view = apply(WidgetRenderer.today(context, s, size(320, 420), now), 320, 420, "aujourdhui-grand");
        ViewGroup list = view.findViewById(R.id.list);
        assertEquals(7, list.getChildCount());
        assertEquals(View.GONE, view.findViewById(R.id.more).getVisibility());
        assertEquals("Maquette du site (1/2)", text(list.getChildAt(4), R.id.row_title));
    }

    @Test
    public void caseCocheeSurLeWidget() throws Exception {
        WidgetStore.setDone(context, "rapport", true);
        Snapshot s = WidgetStore.snapshot(context);
        View view = apply(WidgetRenderer.today(context, s, size(320, 420), now), 320, 420, "aujourdhui-cochee");
        assertEquals("lun. 19 oct. · 3 à faire · 3 faites", text(view, R.id.subtitle));
        ViewGroup list = view.findViewById(R.id.list);
        assertEquals(View.VISIBLE, list.getChildAt(1).findViewById(R.id.check_tick).getVisibility());

        // L'appli lit l'action ; la case reste cochée jusqu'à l'instantané suivant, puis l'appli fait foi.
        JSONArray actions = WidgetStore.takeActions(context);
        assertEquals(1, actions.length());
        assertEquals("done", actions.getJSONObject(0).getString("type"));
        assertEquals("rapport", actions.getJSONObject(0).getString("id"));
        assertTrue(actions.getJSONObject(0).getBoolean("done"));
        assertTrue(WidgetStore.snapshot(context).day("2026-10-19").items.get(1).done);
        WidgetStore.setSnapshot(context, snapshot());
        assertFalse(WidgetStore.snapshot(context).day("2026-10-19").items.get(1).done);
        assertEquals(0, WidgetStore.takeActions(context).length());
    }

    @Test
    public void caseCocheeGardeeTantQueLAppliNeLaPasLue() throws Exception {
        WidgetStore.setDone(context, "mails", true);
        WidgetStore.setSnapshot(context, snapshot());
        assertTrue(WidgetStore.snapshot(context).day("2026-10-19").items.get(3).done);
    }

    @Test
    public void prochaineTache() throws Exception {
        Snapshot s = WidgetStore.snapshot(context);
        View view = apply(WidgetRenderer.next(context, s, now), 250, 90, "prochaine-en-cours");
        assertEquals("MAINTENANT · JUSQU'À 11:00", text(view, R.id.label));
        assertEquals("Réunion d'équipe", text(view, R.id.title));
        assertEquals(View.GONE, view.findViewById(R.id.check_area).getVisibility());

        View later = apply(WidgetRenderer.next(context, s, at(19, 12, 0)), 250, 90, "prochaine-a-suivre");
        assertEquals("À SUIVRE · 14:00", text(later, R.id.label));
        assertEquals("Maquette du site (1/2)", text(later, R.id.title));
        assertEquals(View.VISIBLE, later.findViewById(R.id.check_area).getVisibility());

        View evening = apply(WidgetRenderer.next(context, s, at(19, 21, 0)), 250, 90, "prochaine-demain");
        assertEquals("DEMAIN · 09:00", text(evening, R.id.label));
    }

    @Test
    public void instantaneTropAncien() throws Exception {
        Snapshot s = WidgetStore.snapshot(context);
        View view = apply(WidgetRenderer.today(context, s, size(320, 300), at(25, 9, 0)), 320, 300, "aujourdhui-ancien");
        assertEquals(View.VISIBLE, view.findViewById(R.id.message).getVisibility());
        assertEquals(context.getString(R.string.widget_stale), text(view, R.id.message));
    }

    @Test
    public void adressesVersLAppli() throws Exception {
        assertEquals("add", Widgets.actionFromUri(Uri.parse("planning-widget://add")).getString("type"));
        JSONObject open = Widgets.actionFromUri(Uri.parse("planning-widget://open/task/" + Uri.encode("a b/c")));
        assertEquals("open", open.getString("type"));
        assertEquals("task", open.getString("kind"));
        assertEquals("a b/c", open.getString("id"));
        assertNull(Widgets.actionFromUri(Uri.parse("https://example.org/open/task/x")));
        assertNull(Widgets.actionFromUri(Uri.parse("planning-widget://open/autre/x")));
    }
}
