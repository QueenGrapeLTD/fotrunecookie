import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateRisingSign,
  calculateSunSign,
  getCurrentHourlyTransit,
} from "./astrologyCalc.js";

test("sun sign calculation rejects invalid dates", () => {
  assert.equal(calculateSunSign("1995-04-15")?.id, "aries");
  assert.equal(calculateSunSign("2026-02-30"), null);
  assert.equal(calculateSunSign("invalid"), null);
});

test("calculated sun signs contain every supported interface language", () => {
  const sign = calculateSunSign("1995-04-15");
  for (const language of ["tr", "en", "de", "fr", "es", "it", "el", "zh", "ja", "ko"]) {
    assert.ok(sign?.name?.[language], `Missing Aries translation for ${language}`);
  }
});

test("rising sign requires complete astronomical inputs", () => {
  assert.equal(calculateRisingSign("1995-04-15", "08:30"), null);

  const result = calculateRisingSign("1995-04-15", "08:30", {
    latitude: 41.0082,
    longitude: 28.9784,
    timezoneOffset: 3,
  });
  assert.ok(result);
  assert.ok(/^[a-z]+$/.test(result.id));
});

test("moon phase is deterministic for a known new moon", () => {
  const transit = getCurrentHourlyTransit(new Date("2000-01-06T18:14:00Z"));
  assert.equal(transit.moonPhase, "New Moon");
});

test("rewarded ads require server-verified credits", async () => {
  const clientSource = await readFile(new URL("./adManager.js", import.meta.url), "utf8");
  const serverSource = await readFile(
    new URL("./functions/index.js", import.meta.url),
    "utf8",
  );
  const rewardPolicySource = await readFile(
    new URL("./functions/rewardPolicy.js", import.meta.url),
    "utf8",
  );

  assert.match(clientSource, /RewardAdPluginEvents\.Rewarded/);
  assert.match(clientSource, /RewardAdPluginEvents\.FailedToLoad/);
  assert.match(clientSource, /RewardAdPluginEvents\.FailedToShow/);
  assert.match(clientSource, /rewardItem\?\.amount/);
  assert.match(clientSource, /pending:\s*true/);
  assert.match(clientSource, /ssv:\s*\{\s*userId:\s*uid/);
  assert.match(clientSource, /getAdRewardStateFromServer/);
  assert.doesNotMatch(clientSource, /localStorage/);

  assert.match(serverSource, /verifyAdMobCallback/);
  assert.match(serverSource, /ADMOB_REWARDED_AD_UNIT_IDS/);
  assert.match(serverSource, /_ad_transactions/);
  assert.match(serverSource, /transactionId/);
  assert.match(serverSource, /advanceRewardState/);
  assert.match(rewardPolicySource, /ADMOB_ADS_PER_CREDIT = 1/);
  assert.match(rewardPolicySource, /nextEarnedCredits - previousEarnedCredits/);
  assert.match(serverSource, /PREMIUM_DAILY_LIMIT = 5/);
  assert.match(serverSource, /ADMIN_PREMIUM_DAILY_LIMIT = 50/);
});

test("native display ads use platform-specific app-open and banner units", async () => {
  const clientSource = await readFile(new URL("./adManager.js", import.meta.url), "utf8");
  const androidPlugin = await readFile(
    new URL(
      "./android/app/src/main/java/com/fortunecookieai/app/AppOpenAdPlugin.java",
      import.meta.url,
    ),
    "utf8",
  );
  const iosPlugin = await readFile(
    new URL("./ios/App/App/AppOpenAdPlugin.swift", import.meta.url),
    "utf8",
  );
  const iosBridge = await readFile(
    new URL("./ios/App/App/BridgeViewController.swift", import.meta.url),
    "utf8",
  );
  const iosStoryboard = await readFile(
    new URL("./ios/App/App/Base.lproj/Main.storyboard", import.meta.url),
    "utf8",
  );

  assert.match(clientSource, /VITE_ADMOB_ANDROID_APP_OPEN_AD_UNIT_ID/);
  assert.match(clientSource, /VITE_ADMOB_IOS_APP_OPEN_AD_UNIT_ID/);
  assert.match(clientSource, /VITE_ADMOB_ANDROID_BANNER_AD_UNIT_ID/);
  assert.match(clientSource, /VITE_ADMOB_IOS_BANNER_AD_UNIT_ID/);
  assert.match(clientSource, /BannerAdSize\.ADAPTIVE_BANNER/);
  assert.match(clientSource, /syncDisplayAds\(\{ isPremium = false \}/);
  assert.match(clientSource, /if \(isPremium\) \{\s*await this\.hideBanner\(\)/);
  assert.match(clientSource, /appOpenShownThisLaunch/);
  assert.match(androidPlugin, /AppOpenAd\.load\(/);
  assert.match(androidPlugin, /MAX_CACHE_AGE_MS = 4L \* 60L \* 60L \* 1000L/);
  assert.match(iosPlugin, /AppOpenAd\.load\(with: adId, request: Request\(\)\)/);
  assert.match(iosPlugin, /maximumCacheAge: TimeInterval = 4 \* 60 \* 60/);
  assert.match(iosBridge, /registerPluginType\(AppOpenAdPlugin\.self\)/);
  assert.match(iosStoryboard, /customClass="BridgeViewController"/);
});
