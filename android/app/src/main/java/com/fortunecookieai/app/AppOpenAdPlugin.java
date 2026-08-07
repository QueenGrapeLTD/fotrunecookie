package com.fortunecookieai.app;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.appopen.AppOpenAd;

@CapacitorPlugin(name = "AppOpenAd")
public class AppOpenAdPlugin extends Plugin {
    private static final long MAX_CACHE_AGE_MS = 4L * 60L * 60L * 1000L;

    private AppOpenAd appOpenAd;
    private long loadedAt;
    private boolean loading;
    private boolean showing;

    private boolean isAvailable() {
        return appOpenAd != null && (System.currentTimeMillis() - loadedAt) < MAX_CACHE_AGE_MS;
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        final String adId = call.getString("adId", "").trim();
        if (adId.isEmpty()) {
            call.reject("App open ad unit is missing", "admob/app-open-id-missing");
            return;
        }
        if (isAvailable()) {
            JSObject result = new JSObject();
            result.put("ready", true);
            call.resolve(result);
            return;
        }
        if (loading) {
            call.reject("App open ad is already loading", "admob/app-open-loading");
            return;
        }

        loading = true;
        getActivity().runOnUiThread(() -> AppOpenAd.load(
            getContext(),
            adId,
            new AdRequest.Builder().build(),
            new AppOpenAd.AppOpenAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull AppOpenAd ad) {
                    appOpenAd = ad;
                    loadedAt = System.currentTimeMillis();
                    loading = false;
                    JSObject result = new JSObject();
                    result.put("ready", true);
                    call.resolve(result);
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    appOpenAd = null;
                    loadedAt = 0L;
                    loading = false;
                    call.reject(
                        error.getMessage(),
                        "admob/app-open-load-failed"
                    );
                }
            }
        ));
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (showing) {
            call.reject("App open ad is already showing", "admob/app-open-showing");
            return;
        }
        if (!isAvailable()) {
            appOpenAd = null;
            call.reject("App open ad is not ready", "admob/app-open-not-ready");
            return;
        }

        final AppOpenAd ad = appOpenAd;
        showing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                appOpenAd = null;
                loadedAt = 0L;
                showing = false;
                notifyListeners("dismissed", new JSObject());
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                appOpenAd = null;
                loadedAt = 0L;
                showing = false;
                JSObject data = new JSObject();
                data.put("message", error.getMessage());
                notifyListeners("failedToShow", data);
            }

            @Override
            public void onAdShowedFullScreenContent() {
                notifyListeners("showed", new JSObject());
            }
        });

        getActivity().runOnUiThread(() -> {
            ad.show(getActivity());
            JSObject result = new JSObject();
            result.put("shown", true);
            call.resolve(result);
        });
    }
}
