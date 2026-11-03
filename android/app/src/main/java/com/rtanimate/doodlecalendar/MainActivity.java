package com.rtanimate.doodlecalendar;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Hosts the same web app as the browser version and passes data to the widget. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    public static final String EXTRA_DATE = "date";
    private static final int REQ_PICK = 7;
    private static final int REQ_SAVE = 8;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_PICK);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(getApplicationContext()), "AndroidBridge");
        web.loadUrl(urlFor(getIntent()));
    }

    private String urlFor(Intent intent) {
        String date = intent != null ? intent.getStringExtra(EXTRA_DATE) : null;
        return date != null ? START_URL + "?date=" + Uri.encode(date) : START_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String date = intent.getStringExtra(EXTRA_DATE);
        if (date != null && web != null) web.loadUrl(urlFor(intent));
    }

    @Override
    protected void onPause() {
        super.onPause();
        CalendarWidget.updateAll(this);
    }

    @Override
    public void onBackPressed() {
        // Close an open sheet first; leave the app only when nothing is open.
        web.evaluateJavascript(
                "(function(){var a=document.getElementById('daySheet'),b=document.getElementById('settingsSheet');"
                        + "var open=(a&&!a.hidden)||(b&&!b.hidden)||document.body.classList.contains('peek');"
                        + "if(open)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return open;})()",
                value -> {
                    if (!"true".equals(value)) super.onBackPressed();
                });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
        } else if (requestCode == REQ_SAVE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "Backup saved", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Couldn't save backup", Toast.LENGTH_SHORT).show();
                }
            }
            pendingSave = null;
        }
    }

    /** Methods the web app calls as window.AndroidBridge.* */
    class Bridge {
        private final Context ctx;

        Bridge(Context ctx) { this.ctx = ctx; }

        @JavascriptInterface
        public void saveData(String json) {
            prefs(ctx).edit().putString("data", json).apply();
            CalendarWidget.updateAll(ctx);
        }

        @JavascriptInterface
        public void setArt(int month, String dataUrl) {
            try {
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                try (FileOutputStream out = new FileOutputStream(artFile(ctx, month))) {
                    out.write(bytes);
                }
                CalendarWidget.updateAll(ctx);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void clearArt(int month) {
            //noinspection ResultOfMethodCallIgnored
            artFile(ctx, month).delete();
            CalendarWidget.updateAll(ctx);
        }

        @JavascriptInterface
        public void saveFile(String name, String content) {
            runOnUiThread(() -> {
                pendingSave = content;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                }
            });
        }
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("doodle", MODE_PRIVATE);
    }

    static File artFile(Context ctx, int month) {
        return new File(ctx.getFilesDir(), String.format(Locale.US, "art_%02d.png", month));
    }
}
