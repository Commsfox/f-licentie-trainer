package nl.commsfox.flicentie;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;

/** De web-app in een WebView. De bestanden komen uit de APK (assets), dus geen website of internet nodig. */
public class MainActivity extends Activity {
  // Nep-https-adres: modules, fetch() en localStorage werken niet vanaf file://. Dit adres is voor apps bedoeld.
  private static final String HOST = "appassets.androidplatform.net";
  private WebView web;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.parseColor("#0f1419"));
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor("#0f1419"));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        if (!HOST.equals(req.getUrl().getHost())) return null;
        String path = req.getUrl().getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        String ext = MimeTypeMap.getFileExtensionFromUrl(path);
        String mime = ext.equals("js") ? "text/javascript" : ext.equals("json") ? "application/json"
            : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        try {
          return new WebResourceResponse(mime, "utf-8", getAssets().open("app" + path));
        } catch (IOException e) {
          return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        if (HOST.equals(req.getUrl().getHost())) return false;
        startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));   // externe links in de browser van de telefoon
        return true;
      }
    });
    setContentView(web);
    if (state != null) web.restoreState(state);
    else web.loadUrl("https://" + HOST + "/index.html");
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }
}
