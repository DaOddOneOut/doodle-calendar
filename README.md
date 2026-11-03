# Doodle Calendar

A personal illustrated calendar. Each month's illustration reveals itself, then fades back to sit see-through behind the calendar.

- **Web**: works in any browser. On Android, open the site in Chrome and tap **Install** (or ⋮ → Add to Home screen). It works offline.
- **Android app + widget**: download `DoodleCalendar.apk` from the [Android app release](../../releases/tag/android-latest) and open it. Then long-press your home screen → Widgets → Doodle Calendar.
- **Events & notes**: tap a day to add events (time, color, repeat weekly/monthly/yearly, notes). Each month also has a notes box.
- **Sync**: Settings → Sync. Paste a GitHub token that only has the `gist` permission. Events and month notes sync through one secret gist. Do this on each device.
- **Art**: Settings → Illustration. Replace any month's art with your own image, or change how visible it is behind the calendar.

## Layout
- `web/` is the app (HTML/CSS/JS, no build step). `web/art/01.webp` to `12.webp` hold the default illustrations. Replace them to change the art for everyone.
- `android/` is a small Android wrapper that bundles `web/`, plus the home-screen widget (`CalendarWidget.java`, `WidgetRenderer.java`).
- `.github/workflows/` publishes the web app to GitHub Pages and builds the APK on every push.

The APK is signed with `android/app/doodle.keystore`, so each new build installs over the old one. The key is committed for convenience, so treat the APK as a personal app only.
