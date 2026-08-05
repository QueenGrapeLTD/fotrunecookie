import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./functions/index.js", import.meta.url),
  "utf8",
);
const localeSource = fs.readFileSync(
  new URL("./functions/fortuneLocales.js", import.meta.url),
  "utf8",
);
const clientSource = fs.readFileSync(
  new URL("./firebaseService.js", import.meta.url),
  "utf8",
);

test("fortune generation uses the cost-controlled Gemini model", () => {
  assert.match(source, /gemini-3\.1-flash-lite/);
  assert.match(source, /ThinkingLevel\.MINIMAL/);
  assert.match(source, /GEMINI_MAX_OUTPUT_TOKENS = 220/);
});

test("Gemini usage and token-ceiling failures are observable", () => {
  assert.match(source, /thoughtsTokenCount/);
  assert.match(source, /candidatesTokenCount/);
  assert.match(source, /finishReason === "MAX_TOKENS"/);
  assert.match(source, /modelUsage/);
});

test("fortune prompt is locale-aware and fits the story-card message area", () => {
  assert.match(source, /getFortuneLocale\(lang\)/);
  assert.match(source, /prediction\.length <= localeConfig\.maxCharacters/);
  assert.match(source, /hasRequiredStructure = prediction\.length >= 15/);
  assert.match(source, /isUsableCardResponse/);
  assert.match(source, /hardCardLimit/);
  assert.match(source, /Shorter is welcome/);
  assert.match(source, /selected recipe below/);
  assert.match(source, /hardCardLimit = 80/);
  assert.match(source, /Do not automatically use Japanese motifs/);
  assert.match(source, /one universal everyday image/);
  assert.doesNotMatch(clientSource, /name:\s*cleanString\(profile\.name/);
});

test("fortune generation rotates message forms and reviews a deeper history", () => {
  assert.match(source, /const AI_HISTORY_LIMIT = 24/);
  assert.match(source, /const RECIPE_DIMENSIONS/);
  assert.match(source, /weightedRecipeChoice/);
  assert.match(source, /recipeUsageScore/);
  assert.match(source, /recently used choice cools down/);
  assert.match(source, /SELECTED RECIPE/);
  assert.match(source, /hopeful possibility without guaranteeing/);
  assert.match(source, /organic sharing impulse/);
  assert.match(source, /emotionally recognizable and naturally quotable/);
  assert.match(source, /Never include hashtags/);
  assert.match(source, /SHARING_BAIT_OUTPUT/);
  assert.match(source, /hasSharingBait/);
  assert.match(source, /Never give the reader a task/);
  assert.match(source, /TURKISH_DIRECTIVE_OUTPUT/);
  assert.match(source, /hasForbiddenDirective/);
});

test("all ten languages have explicit locale and character profiles", () => {
  for (const locale of [
    "tr-TR", "en-US", "de-DE", "fr-FR", "es-ES",
    "it-IT", "el-GR", "zh-CN", "ja-JP", "ko-KR",
  ]) {
    assert.match(localeSource, new RegExp(locale));
  }
  assert.match(localeSource, /maxCharacters/);
  assert.equal((localeSource.match(/maxCharacters: 80/g) || []).length, 10);
  assert.match(localeSource, /culturalProfile/);
});
