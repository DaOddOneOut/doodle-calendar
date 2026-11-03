package com.rtanimate.doodlecalendar;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.text.TextPaint;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Draws the widget: paper card, faded month illustration, and the month grid on top. */
final class WidgetRenderer {
    private WidgetRenderer() { }

    static final String[] MONTHS = {"January", "February", "March", "April", "May", "June", "July",
            "August", "September", "October", "November", "December"};
    static final String[] DOW = {"S", "M", "T", "W", "T", "F", "S"};
    static final String[] DOW_SHORT = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    static final int[] ACCENTS = {0xFF5F93CF, 0xFFE2789A, 0xFF6AA55A, 0xFFEA86A8, 0xFFD9A33A, 0xFF2F86D0,
            0xFF3576C9, 0xFFE2A10F, 0xFFBD7638, 0xFFE0731D, 0xFFC06A26, 0xFFD32F37};
    static final int PAPER = 0xFFFBF4EC;
    static final int INK = 0xFF2B2130;
    static final int MUTED = 0xFF7A6C74;
    static final int SUN = 0xFFD8344A;

    static Typeface script, bold, semi;

    static final class Ev {
        String title, date, time, repeat;
        int color;
        int y, m, d;
    }

    static Bitmap render(Context ctx, int W, int H, int year, int month, boolean isCurrentMonth) {
        loadFonts(ctx);
        JSONObject data = readData(ctx);
        List<Ev> events = parseEvents(data);
        JSONObject settings = data.optJSONObject("settings");
        int artOpacity = settings != null ? settings.optInt("artOpacity", 40) : 40;
        boolean frostOn = settings == null || settings.optBoolean("frostOn", true);
        int frost = !frostOn ? 0 : settings != null ? settings.optInt("frost", 60) : 60;
        boolean mondayStart = settings != null && settings.optBoolean("mondayStart", false);
        int accent = ACCENTS[month];

        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        // rounded paper card
        float r = Math.min(W, H) * 0.075f;
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, W, H), r, r, Path.Direction.CW);
        c.clipPath(clip);
        p.setColor(PAPER);
        p.setAlpha(238);
        c.drawRect(0, 0, W, H, p);
        p.setAlpha(255);
        p.setShader(new RadialGradient(W / 2f, H * 0.4f, Math.max(W, H) * 0.7f,
                (accent & 0x00FFFFFF) | 0x26000000, accent & 0x00FFFFFF, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, W, H, p);
        p.setShader(null);

        // the month's illustration, faded into the background
        Bitmap art = loadArt(ctx, month + 1, H);
        if (art != null) {
            float s = (H * 0.98f) / art.getHeight();
            float aw = art.getWidth() * s, ah = art.getHeight() * s;
            RectF dst = new RectF((W - aw) / 2f, H - ah, (W + aw) / 2f, H);
            p.setAlpha(Math.max(0, Math.min(255, Math.round(artOpacity / 100f * 1.15f * 255))));
            c.drawBitmap(art, null, dst, p);
            p.setAlpha(255);
            art.recycle();
        }

        float hh = H * 0.20f;     // header (matches widget.xml weights)
        float fh = H * 0.10f;     // footer line
        float dh = H * 0.065f;    // weekday letters
        float padX = W * 0.04f;

        // frosted card behind the weekday letters and dates only (same idea as the app)
        if (frost > 0) {
            float inset = padX * 0.45f;
            RectF card = new RectF(inset, hh - H * 0.005f, W - inset, H - fh + H * 0.005f);
            float cr = Math.min(W, H) * 0.05f;
            p.setColor(PAPER);
            p.setAlpha(Math.round(Math.min(1f, frost / 100f * 0.82f) * 255));
            c.drawRoundRect(card, cr, cr, p);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(Math.max(1f, W * 0.002f));
            p.setColor(Color.WHITE);
            p.setAlpha(Math.round(frost / 100f * 140));
            c.drawRoundRect(card, cr, cr, p);
            p.setStyle(Paint.Style.FILL);
            p.setAlpha(255);
        }

        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);

        // year + month title
        tp.setTypeface(bold);
        tp.setColor(MUTED);
        tp.setTextSize(hh * 0.16f);
        tp.setLetterSpacing(0.3f);
        c.drawText(String.valueOf(year), W / 2f, hh * 0.27f, tp);
        tp.setLetterSpacing(0f);
        tp.setTypeface(script);
        tp.setColor(INK);
        float ts = hh * 0.62f;
        tp.setTextSize(ts);
        float maxTitle = W * 0.56f;
        float tw = tp.measureText(MONTHS[month]);
        if (tw > maxTitle) tp.setTextSize(ts * maxTitle / tw);
        drawHalo(c, tp, MONTHS[month], W / 2f, hh * 0.86f);

        // arrows
        p.setColor(PAPER);
        p.setAlpha(200);
        float ar = hh * 0.24f;
        c.drawCircle(W * 0.1f, hh * 0.55f, ar, p);
        c.drawCircle(W * 0.9f, hh * 0.55f, ar, p);
        p.setAlpha(255);
        tp.setTypeface(bold);
        tp.setColor(MUTED);
        tp.setTextSize(hh * 0.42f);
        float arrowBase = hh * 0.55f - (tp.ascent() + tp.descent()) / 2f;
        c.drawText("‹", W * 0.1f, arrowBase, tp);
        c.drawText("›", W * 0.9f, arrowBase, tp);

        // weekday letters
        float cellW = (W - 2 * padX) / 7f;
        tp.setTypeface(bold);
        tp.setTextSize(dh * 0.5f);
        int start = mondayStart ? 1 : 0;
        for (int i = 0; i < 7; i++) {
            int d = (i + start) % 7;
            tp.setColor(d == 0 ? SUN : MUTED);
            drawHalo(c, tp, DOW[d], padX + cellW * (i + 0.5f), hh + dh * 0.72f);
        }

        // day grid
        Calendar cal = Calendar.getInstance();
        int ty = cal.get(Calendar.YEAR), tm = cal.get(Calendar.MONTH), td = cal.get(Calendar.DAY_OF_MONTH);
        cal.clear();
        cal.set(year, month, 1);
        int firstDow = cal.get(Calendar.DAY_OF_WEEK) - 1;
        int lead = (firstDow - start + 7) % 7;
        int daysIn = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rows = (int) Math.ceil((lead + daysIn) / 7.0);
        float top = hh + dh;
        float cellH = (H - fh - top) / rows;
        float ns = Math.min(cellH * 0.44f, cellW * 0.42f);
        tp.setTextSize(ns);
        int monthEvents = 0;
        for (int day = 1; day <= daysIn; day++) {
            int idx = lead + day - 1;
            int col = idx % 7, row = idx / 7;
            float cx = padX + cellW * (col + 0.5f);
            float cy = top + cellH * row + cellH * 0.42f;
            int dow = (idx + start) % 7;
            String label = String.valueOf(day);
            float base = cy - (tp.ascent() + tp.descent()) / 2f;
            boolean isToday = year == ty && month == tm && day == td;
            if (isToday) {
                p.setColor(accent);
                c.drawCircle(cx, cy, Math.min(cellW, cellH) * 0.36f, p);
                tp.setColor(Color.WHITE);
                c.drawText(label, cx, base, tp);
            } else {
                tp.setColor(dow == 0 ? SUN : INK);
                drawHalo(c, tp, label, cx, base);
            }
            List<Ev> on = eventsOn(events, year, month + 1, day);
            monthEvents += on.size();
            int n = Math.min(3, on.size());
            float dr = Math.max(2f, ns * 0.11f);
            float dotY = cy + Math.min(cellW, cellH) * 0.36f + dr * 1.6f;
            if (dotY + dr > top + cellH * (row + 1)) dotY = top + cellH * (row + 1) - dr * 1.2f;
            for (int k = 0; k < n; k++) {
                float dx = cx + (k - (n - 1) / 2f) * dr * 2.8f;
                p.setColor(PAPER);
                c.drawCircle(dx, dotY, dr * 1.45f, p);
                p.setColor(on.get(k).color != 0 ? on.get(k).color : accent);
                c.drawCircle(dx, dotY, dr, p);
            }
        }

        // footer: next event (this month) or a count (other months)
        String footer;
        int footerDot = 0;
        if (isCurrentMonth) {
            String[] next = nextEvent(events, ty, tm + 1, td);
            footer = next == null ? "Nothing coming up" : next[0];
            if (next != null) footerDot = Integer.parseInt(next[1]);
        } else {
            footer = monthEvents == 0 ? "No events this month"
                    : monthEvents + (monthEvents == 1 ? " event this month" : " events this month");
        }
        tp.setTypeface(semi);
        tp.setTextAlign(Paint.Align.LEFT);
        tp.setTextSize(fh * 0.36f);
        tp.setColor(INK);
        float fx = padX + cellW * 0.25f;
        float fy = H - fh * 0.45f - (tp.ascent() + tp.descent()) / 2f;
        if (footerDot != 0) {
            p.setColor(footerDot);
            float rr = fh * 0.09f;
            c.drawCircle(fx + rr, H - fh * 0.45f, rr, p);
            fx += rr * 3.2f;
        }
        CharSequence fit = TextUtils.ellipsize(footer, tp, W - fx - padX, TextUtils.TruncateAt.END);
        drawHaloLeft(c, tp, fit.toString(), fx, fy);
        return bmp;
    }

    static void drawHalo(Canvas c, TextPaint tp, String s, float x, float y) {
        int color = tp.getColor();
        Paint.Style st = tp.getStyle();
        tp.setStyle(Paint.Style.STROKE);
        tp.setStrokeJoin(Paint.Join.ROUND);
        tp.setStrokeWidth(tp.getTextSize() * 0.2f);
        tp.setColor(PAPER);
        tp.setAlpha(225);
        c.drawText(s, x, y, tp);
        tp.setStyle(st);
        tp.setColor(color);
        c.drawText(s, x, y, tp);
    }

    private static void drawHaloLeft(Canvas c, TextPaint tp, String s, float x, float y) {
        drawHalo(c, tp, s, x, y);
    }

    static void loadFonts(Context ctx) {
        if (script != null) return;
        try {
            script = Typeface.createFromAsset(ctx.getAssets(), "www/fonts/DancingScript_700Bold.ttf");
            bold = Typeface.createFromAsset(ctx.getAssets(), "www/fonts/Nunito_800ExtraBold.ttf");
            semi = Typeface.createFromAsset(ctx.getAssets(), "www/fonts/Nunito_600SemiBold.ttf");
        } catch (RuntimeException e) {
            script = Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC);
            bold = Typeface.DEFAULT_BOLD;
            semi = Typeface.DEFAULT;
        }
    }

    static Bitmap loadArt(Context ctx, int month, int targetH) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        File custom = MainActivity.artFile(ctx, month);
        try {
            if (custom.exists()) {
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(custom.getPath(), bounds);
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = sample(bounds.outHeight, targetH);
                return BitmapFactory.decodeFile(custom.getPath(), o);
            }
            String path = String.format(Locale.US, "www/art/still/%02d.webp", month);
            try (InputStream in = ctx.getAssets().open(path)) {
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeStream(in, null, bounds);
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inSampleSize = sample(bounds.outHeight, targetH);
            try (InputStream in = ctx.getAssets().open(path)) {
                return BitmapFactory.decodeStream(in, null, o);
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static int sample(int srcH, int targetH) {
        int s = 1;
        while (srcH / (s * 2) >= targetH) s *= 2;
        return s;
    }

    // ---------- data ----------

    static JSONObject readData(Context ctx) {
        try {
            String json = MainActivity.prefs(ctx).getString("data", null);
            return json == null ? new JSONObject() : new JSONObject(json);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static List<Ev> parseEvents(JSONObject data) {
        List<Ev> out = new ArrayList<>();
        JSONArray arr = data.optJSONArray("events");
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            Ev e = new Ev();
            e.title = o.optString("title", "");
            e.date = o.optString("date", "");
            e.time = o.optString("time", "");
            e.repeat = o.optString("repeat", "none");
            try {
                e.color = Color.parseColor(o.optString("color", "#e2789a"));
            } catch (IllegalArgumentException ex) {
                e.color = 0;
            }
            String[] parts = e.date.split("-");
            if (parts.length != 3) continue;
            try {
                e.y = Integer.parseInt(parts[0]);
                e.m = Integer.parseInt(parts[1]);
                e.d = Integer.parseInt(parts[2]);
            } catch (NumberFormatException ex) {
                continue;
            }
            out.add(e);
        }
        return out;
    }

    /** Same rules as occurs() in web/app.js. Month is 1-12. */
    static boolean occurs(Ev e, int y, int m, int d) {
        long target = epochDay(y, m, d), start = epochDay(e.y, e.m, e.d);
        if (target == start) return true;
        if (target < start || e.repeat == null) return false;
        switch (e.repeat) {
            case "weekly": return (target - start) % 7 == 0;
            case "monthly": return e.d == d;
            case "yearly": return e.d == d && e.m == m;
            default: return false;
        }
    }

    static List<Ev> eventsOn(List<Ev> all, int y, int m, int d) {
        List<Ev> out = new ArrayList<>();
        for (Ev e : all) if (occurs(e, y, m, d)) out.add(e);
        Collections.sort(out, (a, b) -> {
            String ta = a.time.isEmpty() ? "99" : a.time, tb = b.time.isEmpty() ? "99" : b.time;
            int t = ta.compareTo(tb);
            return t != 0 ? t : a.title.compareTo(b.title);
        });
        return out;
    }

    /** Returns {label, color} for the next event from today (within a year), or null. */
    private static String[] nextEvent(List<Ev> all, int y, int m, int d) {
        if (all.isEmpty()) return null;
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(y, m - 1, d);
        for (int i = 0; i < 366; i++) {
            int cy = c.get(Calendar.YEAR), cm = c.get(Calendar.MONTH) + 1, cd = c.get(Calendar.DAY_OF_MONTH);
            List<Ev> on = eventsOn(all, cy, cm, cd);
            if (!on.isEmpty()) {
                Ev e = on.get(0);
                String when = i == 0 ? "Today" : i == 1 ? "Tomorrow"
                        : DOW_SHORT[c.get(Calendar.DAY_OF_WEEK) - 1] + " " + MONTHS[cm - 1].substring(0, 3) + " " + cd;
                String time = e.time.isEmpty() ? "" : " · " + fmtTime(e.time);
                String more = on.size() > 1 ? "  +" + (on.size() - 1) : "";
                return new String[]{when + "  " + e.title + time + more, String.valueOf(e.color)};
            }
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return null;
    }

    static String fmtTime(String t) {
        try {
            String[] p = t.split(":");
            int h = Integer.parseInt(p[0]);
            String ap = h < 12 ? "AM" : "PM";
            int h12 = h % 12 == 0 ? 12 : h % 12;
            return h12 + ":" + p[1] + " " + ap;
        } catch (Exception e) {
            return t;
        }
    }

    /** Days since 1970-01-01 (proleptic Gregorian), month 1-12. */
    static long epochDay(int y, int m, int d) {
        y -= m <= 2 ? 1 : 0;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }
}
