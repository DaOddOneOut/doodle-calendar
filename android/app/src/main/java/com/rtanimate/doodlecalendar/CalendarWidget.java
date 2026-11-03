package com.rtanimate.doodlecalendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.Locale;

/** Home-screen widget: this month's grid drawn over the month's illustration. */
public class CalendarWidget extends AppWidgetProvider {
    static final String ACTION_PREV = "com.rtanimate.doodlecalendar.PREV";
    static final String ACTION_NEXT = "com.rtanimate.doodlecalendar.NEXT";
    static final String ACTION_TICK = "com.rtanimate.doodlecalendar.TICK";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) update(ctx, mgr, id);
        scheduleMidnight(ctx);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        update(ctx, mgr, id);
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        SharedPreferences.Editor e = MainActivity.prefs(ctx).edit();
        for (int id : ids) e.remove("off_" + id);
        e.apply();
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (a == null) return;
        if (ACTION_PREV.equals(a) || ACTION_NEXT.equals(a)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
            if (id < 0) return;
            SharedPreferences p = MainActivity.prefs(ctx);
            int off = p.getInt("off_" + id, 0) + (ACTION_NEXT.equals(a) ? 1 : -1);
            p.edit().putInt("off_" + id, off).apply();
            update(ctx, AppWidgetManager.getInstance(ctx), id);
        } else if (ACTION_TICK.equals(a) || Intent.ACTION_DATE_CHANGED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            // new day: snap every widget back to the current month
            SharedPreferences p = MainActivity.prefs(ctx);
            SharedPreferences.Editor e = p.edit();
            for (String k : p.getAll().keySet()) if (k.startsWith("off_")) e.remove(k);
            e.apply();
            updateAll(ctx);
            scheduleMidnight(ctx);
        }
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, CalendarWidget.class));
        for (int id : ids) update(ctx, mgr, id);
    }

    static void update(Context ctx, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        int wDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int hDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (wDp <= 0) wDp = 300;
        if (hDp <= 0) hDp = 320;
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        float scale = Math.min(dm.density, 2.75f);
        int offset = MainActivity.prefs(ctx).getInt("off_" + id, 0);

        Calendar shown = Calendar.getInstance();
        shown.set(Calendar.DAY_OF_MONTH, 1);
        shown.add(Calendar.MONTH, offset);

        // Big bitmaps can exceed the binder limit on some launchers; retry smaller if so.
        float[] tries = {1f, 0.7f, 0.5f};
        for (float t : tries) {
            int w = Math.max(100, Math.round(wDp * scale * t));
            int h = Math.max(100, Math.round(hDp * scale * t));
            double maxPx = 1_300_000;
            if ((double) w * h > maxPx) {
                double k = Math.sqrt(maxPx / ((double) w * h));
                w = (int) (w * k);
                h = (int) (h * k);
            }
            try {
                Bitmap bmp = WidgetRenderer.render(ctx, w, h, shown.get(Calendar.YEAR), shown.get(Calendar.MONTH), offset == 0);
                RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget);
                rv.setImageViewBitmap(R.id.canvas, bmp);
                PendingIntent open = openApp(ctx, id, shown);
                rv.setOnClickPendingIntent(R.id.open, open);
                rv.setOnClickPendingIntent(R.id.open_top, open);
                rv.setOnClickPendingIntent(R.id.prev, broadcast(ctx, id, ACTION_PREV, 1));
                rv.setOnClickPendingIntent(R.id.next, broadcast(ctx, id, ACTION_NEXT, 2));
                mgr.updateAppWidget(id, rv);
                return;
            } catch (RuntimeException e) {
                // try again at a smaller size
            }
        }
    }

    private static PendingIntent openApp(Context ctx, int id, Calendar shown) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra(MainActivity.EXTRA_DATE, String.format(Locale.US, "%04d-%02d-01",
                shown.get(Calendar.YEAR), shown.get(Calendar.MONTH) + 1));
        return PendingIntent.getActivity(ctx, id * 10, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent broadcast(Context ctx, int id, String action, int slot) {
        Intent i = new Intent(ctx, CalendarWidget.class);
        i.setAction(action);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(ctx, id * 10 + slot, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleMidnight(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_MONTH, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 5);
        c.set(Calendar.MILLISECOND, 0);
        Intent i = new Intent(ctx, CalendarWidget.class);
        i.setAction(ACTION_TICK);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 9, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.set(AlarmManager.RTC, c.getTimeInMillis(), pi);
    }
}
