# Doodle Calendar

A personal illustrated calendar. Each month's illustration reveals itself, then fades back to sit see-through behind the calendar.

- **Web**: works in any browser. On Android, open the site in Chrome and tap **Install** (or ⋮ → Add to Home screen). It works offline.
- **Android app + widget**: download `DoodleCalendar.apk` from the [Android app release](../../releases/tag/android-latest) and open it. Then long-press your home screen → Widgets → Doodle Calendar.
- **Events & notes**: tap a day to add events (time, color, repeat weekly/monthly/yearly, notes). Each month also has a notes box.
- **Backup**: events are stored on each device. Settings → Backup exports and imports them.
- **Art**: Settings → Illustrations. Choose animated or still art, replace any month with your own (still or animated), and adjust how visible the art and the frosted date panel are.
- **Jump to a date**: tap the year or the month name at the top.

## Layout
- `web/` is the app (HTML/CSS/JS, no build step). `web/art/still/` holds the still illustrations (WebP) and `web/art/anim/` the animated ones (WebM with transparency). Replace a file to change that month's art. The widget always uses the still version.
- `android/` is a small Android wrapper that bundles `web/`, plus the home-screen widget (`CalendarWidget.java`, `WidgetRenderer.java`).
- `.github/workflows/` publishes the web app to GitHub Pages and builds the APK on every push.

The APK is signed with `android/app/doodle.keystore`, so each new build installs over the old one. The key is committed for convenience, so treat the APK as a personal app only.
