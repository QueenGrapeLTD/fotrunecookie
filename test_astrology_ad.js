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
  assert.match(clientSource, /RewardAdPluginEvents\.Showed/);
  assert.match(clientSource, /VITE_ADMOB_TEST_MODE === "true"/);
  assert.match(clientSource, /if \(this\.isTestMode\(\)\) return TEST_REWARDED_IDS/);
  assert.match(clientSource, /admob\/rewarded-load-failed/);
  assert.match(clientSource, /admob\/no-fill/);
  assert.match(clientSource, /isNoFillError/);
  assert.match(clientSource, /admob\/rewarded-presentation-timeout/);
  assert.match(clientSource, /admob\/rewarded-completion-timeout/);
  assert.match(clientSource, /admob\/session-timeout/);
  assert.match(clientSource, /npa:\s*this\.requestNonPersonalizedAds/);
  assert.match(clientSource, /rewardItem\?\.amount/);
  assert.match(clientSource, /pending:\s*true/);
  assert.match(clientSource, /ssv:\s*\{\s*userId:\s*uid/);
  assert.match(clientSource, /getAdRewardStateFromServer/);
  assert.doesNotMatch(clientSource, /localStorage/);
  assert.doesNotMatch(
    clientSource,
    /await ensureFreemiumSession\(\);\s*await AdMob\.initialize/s,
  );

  assert.match(serverSource, /verifyAdMobCallback/);
  assert.match(serverSource, /ADMOB_REWARDED_AD_UNIT_IDS/);
  assert.match(serverSource, /_ad_transactions/);
  assert.match(serverSource, /transactionId/);
  assert.match(serverSource, /advanceRewardState/);
  assert.match(rewardPolicySource, /ADMOB_ADS_PER_CREDIT = 3/);
  assert.match(rewardPolicySource, /nextEarnedCredits - previousEarnedCredits/);
  assert.match(serverSource, /PREMIUM_DAILY_LIMIT = 5/);
  assert.match(serverSource, /ADMIN_PREMIUM_DAILY_LIMIT = 50/);
});
