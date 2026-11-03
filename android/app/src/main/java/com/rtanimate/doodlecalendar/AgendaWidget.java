package com.rtanimate.doodlecalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.Locale;

/** Wide widget: month grid + today's agenda + quick add. */
public class AgendaWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) update(ctx, mgr, id);
        CalendarWidget.scheduleMidnight(ctx);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        update(ctx, mgr, id);
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, AgendaWidget.class));
        for (int id : ids) update(ctx, mgr, id);
    }

    static void update(Context ctx, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        // wide widget: use the larger width and the smaller height (portrait home screen)
        int wDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        int hDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (wDp <= 0) wDp = 340;
        if (hDp <= 0) hDp = 160;
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        float scale = Math.min(dm.density, 2.75f);

        float[] tries = {1f, 0.7f, 0.5f};
        for (float t : tries) {
            int w = Math.max(200, Math.round(wDp * scale * t));
            int h = Math.max(90, Math.round(hDp * scale * t));
            double maxPx = 1_100_000;
            if ((double) w * h > maxPx) {
                double k = Math.sqrt(maxPx / ((double) w * h));
                w = (int) (w * k);
                h = (int) (h * k);
            }
            try {
                AgendaRenderer.Result r = AgendaRenderer.render(ctx, w, h);
                RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda);
                rv.setImageViewBitmap(R.id.canvas, r.bitmap);

                String todayStr = today();
                PendingIntent openToday = open(ctx, id * 100 + 90, todayStr, false, false);
                rv.setOnClickPendingIntent(R.id.canvas, openToday);
                rv.setOnClickPendingIntent(R.id.open_top, openToday);
                rv.setOnClickPendingIntent(R.id.open_list, open(ctx, id * 100 + 91, todayStr, true, false));
                rv.setOnClickPendingIntent(R.id.add, open(ctx, id * 100 + 92, todayStr, true, true));

                String pkg = ctx.getPackageName();
                for (int row = 0; row < 6; row++) {
                    int rowId = ctx.getResources().getIdentifier("row" + row, "id", pkg);
                    rv.setViewVisibility(rowId, row < r.rows ? View.VISIBLE : View.GONE);
                    for (int col = 0; col < 7; col++) {
                        int cellId = ctx.getResources().getIdentifier("c" + row + col, "id", pkg);
                        int day = row * 7 + col - r.lead + 1;
                        String date = String.format(Locale.US, "%04d-%02d-%02d", r.year, r.month + 1, Math.max(1, day));
                        boolean real = day >= 1 && day <= daysIn(r.year, r.month);
                        rv.setOnClickPendingIntent(cellId, real
                                ? open(ctx, id * 100 + row * 7 + col, date, true, false)
                                : openToday);
                    }
                }
                mgr.updateAppWidget(id, rv);
                return;
            } catch (RuntimeException e) {
                // try smaller
            }
        }
    }

    private static int daysIn(int year, int month) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(year, month, 1);
        return c.getActualMaximum(Calendar.DAY_OF_MONTH);
    }

    private static String today() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    private static PendingIntent open(Context ctx, int requestCode, String date, boolean openDay, boolean add) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        // unique data so each tap target keeps its own extras
        i.setData(Uri.parse("doodle://agenda/" + requestCode + "/" + date + "/" + openDay + "/" + add));
        i.putExtra(MainActivity.EXTRA_DATE, date);
        i.putExtra(MainActivity.EXTRA_OPEN_DAY, openDay);
        i.putExtra(MainActivity.EXTRA_ADD, add);
        return PendingIntent.getActivity(ctx, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
