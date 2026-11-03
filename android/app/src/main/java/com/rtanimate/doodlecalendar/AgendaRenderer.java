package com.rtanimate.doodlecalendar;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.text.TextPaint;
import android.text.TextUtils;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

import static com.rtanimate.doodlecalendar.WidgetRenderer.*;

/**
 * Wide widget: month grid on the left, today's date and events on the right.
 * The fractions below must match res/layout/widget_agenda.xml (tap areas).
 */
final class AgendaRenderer {
    private AgendaRenderer() { }

    // horizontal fractions of W
    static final float GRID_X0 = 0.035f, GRID_X1 = 0.50f, RIGHT_X0 = 0.555f, RIGHT_X1 = 0.965f;
    // vertical fractions of H
    static final float DOW_Y0 = 0.08f, GRID_Y0 = 0.22f, GRID_Y1 = 0.93f;
    static final float PLUS_CX = 0.90f, PLUS_CY = 0.175f;

    static final class Result {
        Bitmap bitmap;
        int rows;
        int lead;      // empty cells before day 1
        int year, month;
    }

    static Result render(Context ctx, int W, int H) {
        loadFonts(ctx);
        JSONObject data = readData(ctx);
        List<Ev> events = parseEvents(data);
        JSONObject settings = data.optJSONObject("settings");
        int artOpacity = settings != null ? settings.optInt("artOpacity", 40) : 40;
        boolean frostOn = settings == null || settings.optBoolean("frostOn", true);
        int frost = !frostOn ? 0 : settings != null ? settings.optInt("frost", 60) : 60;
        boolean mondayStart = settings != null && settings.optBoolean("mondayStart", false);

        Calendar now = Calendar.getInstance();
        int year = now.get(Calendar.YEAR), month = now.get(Calendar.MONTH), today = now.get(Calendar.DAY_OF_MONTH);
        int accent = ACCENTS[month];

        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        // card
        float r = H * 0.16f;
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, W, H), r, r, Path.Direction.CW);
        c.clipPath(clip);
        p.setColor(PAPER);
        p.setAlpha(240);
        c.drawRect(0, 0, W, H, p);
        p.setAlpha(255);

        // art on the right half, faded
        Bitmap art = loadArt(ctx, month + 1, Math.round(H * 1.2f));
        if (art != null) {
            float s = (H * 1.15f) / art.getHeight();
            float aw = art.getWidth() * s, ah = art.getHeight() * s;
            float cx = W * 0.76f;
            RectF dst = new RectF(cx - aw / 2f, H - ah * 0.97f, cx + aw / 2f, H + ah * 0.03f);
            p.setAlpha(Math.max(0, Math.min(255, Math.round(artOpacity / 100f * 1.15f * 255))));
            c.drawBitmap(art, null, dst, p);
            p.setAlpha(255);
            art.recycle();
        }

        // frosted card behind the grid
        if (frost > 0) {
            RectF card = new RectF(W * 0.018f, H * 0.045f, W * 0.517f, H * 0.955f);
            float cr = H * 0.12f;
            p.setColor(PAPER);
            p.setAlpha(Math.round(Math.min(1f, frost / 100f * 0.82f) * 255));
            c.drawRoundRect(card, cr, cr, p);
            // and behind the event list on the right
            RectF list = new RectF(W * 0.535f, H * 0.43f, W * 0.982f, H * 0.955f);
            c.drawRoundRect(list, H * 0.1f, H * 0.1f, p);
            p.setAlpha(255);
        }

        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);

        // ----- month grid -----
        int start = mondayStart ? 1 : 0;
        float gx0 = W * GRID_X0, gx1 = W * GRID_X1;
        float cellW = (gx1 - gx0) / 7f;
        tp.setTypeface(bold);
        float dowH = H * (GRID_Y0 - DOW_Y0);
        tp.setTextSize(Math.min(dowH * 0.5f, cellW * 0.42f));
        for (int i = 0; i < 7; i++) {
            int d = (i + start) % 7;
            tp.setColor(d == 0 ? SUN : MUTED);
            float base = H * DOW_Y0 + dowH / 2f - (tp.ascent() + tp.descent()) / 2f;
            drawHalo(c, tp, DOW[d], gx0 + cellW * (i + 0.5f), base);
        }
        Calendar cal = Calendar.getInstance();
        cal.clear();
        cal.set(year, month, 1);
        int firstDow = cal.get(Calendar.DAY_OF_WEEK) - 1;
        int lead = (firstDow - start + 7) % 7;
        int daysIn = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rows = (int) Math.ceil((lead + daysIn) / 7.0);
        float gy0 = H * GRID_Y0, gy1 = H * GRID_Y1;
        float cellH = (gy1 - gy0) / rows;
        float ns = Math.min(cellH * 0.56f, cellW * 0.46f);
        tp.setTextSize(ns);
        for (int day = 1; day <= daysIn; day++) {
            int idx = lead + day - 1, col = idx % 7, row = idx / 7;
            float cx = gx0 + cellW * (col + 0.5f);
            float cy = gy0 + cellH * row + cellH * 0.44f;
            float base = cy - (tp.ascent() + tp.descent()) / 2f;
            int dow = (idx + start) % 7;
            String label = String.valueOf(day);
            if (day == today) {
                p.setColor(accent);
                c.drawCircle(cx, cy, Math.min(cellW * 0.46f, cellH * 0.5f), p);
                tp.setColor(Color.WHITE);
                c.drawText(label, cx, base, tp);
            } else {
                tp.setColor(dow == 0 ? SUN : INK);
                drawHalo(c, tp, label, cx, base);
            }
            List<Ev> on = eventsOn(events, year, month + 1, day);
            if (!on.isEmpty() && day != today) {
                float dr = Math.max(1.5f, cellH * 0.06f);
                p.setColor(on.get(0).color != 0 ? on.get(0).color : accent);
                c.drawCircle(cx, cy + cellH * 0.38f, dr, p);
            }
        }

        // ----- right side: date, + button, events -----
        float rx0 = W * RIGHT_X0, rx1 = W * RIGHT_X1;
        float plusR = Math.min(H * 0.105f, W * 0.05f);
        float pcx = W * PLUS_CX, pcy = H * PLUS_CY;
        p.setColor(accent);
        c.drawCircle(pcx, pcy, plusR, p);
        p.setColor(Color.WHITE);
        p.setStrokeWidth(plusR * 0.16f);
        p.setStrokeCap(Paint.Cap.ROUND);
        c.drawLine(pcx - plusR * 0.42f, pcy, pcx + plusR * 0.42f, pcy, p);
        c.drawLine(pcx, pcy - plusR * 0.42f, pcx, pcy + plusR * 0.42f, p);

        tp.setTextAlign(Paint.Align.LEFT);
        tp.setTypeface(bold);
        tp.setColor(MUTED);
        tp.setTextSize(H * 0.068f);
        tp.setLetterSpacing(0.18f);
        String weekday = new String[]{"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"}[now.get(Calendar.DAY_OF_WEEK) - 1];
        drawHalo(c, tp, weekday, rx0, H * 0.15f);
        tp.setLetterSpacing(0f);
        tp.setTypeface(script);
        tp.setColor(INK);
        float ds = H * 0.2f;
        tp.setTextSize(ds);
        String dateLabel = MONTHS[month].substring(0, 3) + " " + today;
        float maxW = (pcx - plusR * 1.3f) - rx0;
        float dw = tp.measureText(dateLabel);
        if (dw > maxW) tp.setTextSize(ds * maxW / dw);
        drawHalo(c, tp, dateLabel, rx0, H * 0.36f);

        float y = H * 0.50f;
        float lineH = H * 0.125f;
        float bottom = H * 0.94f;
        float ts = H * 0.072f;
        List<Ev> todays = eventsOn(events, year, month + 1, today);
        if (!todays.isEmpty()) {
            for (int i = 0; i < todays.size() && y + lineH * 0.5f <= bottom; i++) {
                boolean last = y + lineH * 1.5f > bottom && i < todays.size() - 1;
                if (last) {
                    line(c, tp, p, 0, "", "+" + (todays.size() - i) + " more", rx0, rx1, y, ts, MUTED);
                    break;
                }
                Ev e = todays.get(i);
                line(c, tp, p, e.color != 0 ? e.color : accent, e.time.isEmpty() ? "All day" : fmtTime(e.time), e.title, rx0, rx1, y, ts, INK);
                y += lineH;
            }
        } else {
            tp.setTypeface(semi);
            tp.setTextSize(ts);
            tp.setColor(MUTED);
            drawHalo(c, tp, "No events today", rx0, y + ts * 0.35f);
            y += lineH * 1.15f;
            List<String[]> upcoming = upcoming(events, now, 3);
            if (!upcoming.isEmpty() && y + lineH * 0.9f <= bottom) {
                tp.setTypeface(bold);
                tp.setTextSize(H * 0.055f);
                tp.setLetterSpacing(0.16f);
                tp.setColor(MUTED);
                drawHalo(c, tp, "COMING UP", rx0, y);
                tp.setLetterSpacing(0f);
                y += lineH * 0.8f;
                for (String[] u : upcoming) {
                    if (y + lineH * 0.4f > bottom) break;
                    line(c, tp, p, Integer.parseInt(u[2]), u[0], u[1], rx0, rx1, y, ts * 0.95f, INK);
                    y += lineH;
                }
            }
        }

        Result res = new Result();
        res.bitmap = bmp;
        res.rows = rows;
        res.lead = lead;
        res.year = year;
        res.month = month;
        return res;
    }

    /** one agenda row: colored dot, small label (time/date), title */
    private static void line(Canvas c, TextPaint tp, Paint p, int dot, String label, String title,
                             float x0, float x1, float y, float size, int color) {
        float x = x0;
        if (dot != 0) {
            p.setColor(dot);
            c.drawCircle(x + size * 0.28f, y - size * 0.32f, size * 0.26f, p);
            x += size * 0.9f;
        }
        tp.setTextSize(size * 0.86f);
        tp.setTypeface(bold);
        tp.setColor(MUTED);
        if (!label.isEmpty()) {
            drawHalo(c, tp, label, x, y);
            x += tp.measureText(label) + size * 0.5f;
        }
        tp.setTextSize(size);
        tp.setTypeface(semi);
        tp.setColor(color);
        CharSequence fit = TextUtils.ellipsize(title, tp, Math.max(0, x1 - x), TextUtils.TruncateAt.END);
        drawHalo(c, tp, fit.toString(), x, y);
    }

    /** {dateLabel, title, color} for the next few events after today, within 60 days */
    private static List<String[]> upcoming(List<Ev> all, Calendar from, int max) {
        List<String[]> out = new ArrayList<>();
        Calendar c = (Calendar) from.clone();
        for (int i = 1; i <= 60 && out.size() < max; i++) {
            c.add(Calendar.DAY_OF_MONTH, 1);
            int y = c.get(Calendar.YEAR), m = c.get(Calendar.MONTH) + 1, d = c.get(Calendar.DAY_OF_MONTH);
            for (Ev e : eventsOn(all, y, m, d)) {
                if (out.size() >= max) break;
                String when = i == 1 ? "Tomorrow" : String.format(Locale.US, "%s %d",
                        DOW_SHORT[c.get(Calendar.DAY_OF_WEEK) - 1], d);
                out.add(new String[]{when, e.title, String.valueOf(e.color != 0 ? e.color : ACCENTS[m - 1])});
            }
        }
        return out;
    }
}
