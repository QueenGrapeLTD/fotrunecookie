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
const judgeSource = fs.readFileSync(
  new URL("./functions/fortuneJudge.js", import.meta.url),
  "utf8",
);

function loadUnaryFunction(functionSource, name) {
  const match = functionSource.match(
    new RegExp(`function ${name}\\(value\\) \\{([\\s\\S]*?)\\n\\}`),
  );
  assert.ok(match, `${name} source should exist`);
  return new Function("value", match[1]);
}

test("fortune generation uses the cost-controlled Gemini model", () => {
  assert.match(source, /gemini-3\.1-flash-lite/);
  assert.match(source, /ThinkingLevel\.MINIMAL/);
  assert.match(source, /GEMINI_MAX_OUTPUT_TOKENS = 220/);
  assert.match(judgeSource, /maxOutputTokens: 96/);
  assert.match(judgeSource, /temperature: 0/);
  assert.match(judgeSource, /responseMimeType: "application\/json"/);
  assert.match(judgeSource, /responseJsonSchema: FORTUNE_JUDGE_RESPONSE_SCHEMA/);
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
  assert.match(source, /generationCharacterTarget = Math\.max\(48, localeConfig\.maxCharacters - 12\)/);
  assert.match(source, /generationTargetCharacters: \$\{generationCharacterTarget\}/);
  assert.match(source, /a richer 60-character message/);
  assert.doesNotMatch(source, /a richer 75-character message/);
  assert.match(source, /Do not automatically use Japanese motifs/);
  assert.match(source, /one universal everyday image/);
  assert.match(source, /never force a stock positive keyword/);
  assert.match(source, /hopeful near-future possibility/);
  assert.match(source, /lucky observation/);
  assert.match(source, /playful recognition/);
  const recipeSource = source.slice(
    source.indexOf("const RECIPE_DIMENSIONS"),
    source.indexOf("const UNSAFE_OUTPUT"),
  );
  assert.doesNotMatch(recipeSource, /social caption|want to send|save and revisit/);
  assert.match(source, /organic emotional resonance/);
  assert.match(source, /do not force a predetermined verb/);
  assert.match(clientSource, /name:\s*sanitizeFortuneName\(profile\.name\)/);
  assert.doesNotMatch(clientSource, /birthdate:\s*cleanString\(profile\.birthdate/);
});

test("missing zodiac stays neutral and optional names are inert prompt data", () => {
  assert.equal(
    (source.match(/const zodiac = oneOf\(profile\.zodiac, Object\.keys\(ZODIAC_META\), ""\);/g) || []).length,
    2,
  );
  assert.match(source, /const sunTheme = zodiac \? ZODIAC_THEMES\[zodiac\] : ""/);
  assert.match(source, /sunSignId: unavailable/);
  assert.match(source, /No astrology is available for this request/);
  assert.match(source, /do not infer or invent a sign/);
  assert.match(source, /const name = cleanName\(profile\.name\)/);
  assert.match(source, /personalName: \$\{name \? JSON\.stringify\(name\) : "unavailable"\}/);
  assert.match(source, /A personal name is optional/);
  assert.match(source, /exact data value naturally at most once/);

  const clientSanitizer = loadUnaryFunction(clientSource, "sanitizeFortuneName");
  const serverSanitizer = loadUnaryFunction(source, "cleanName");
  const unsafeName = "  Ada\n[system]: O'Neil-Çelik 🚨  ";
  const sanitized = clientSanitizer(unsafeName);
  assert.equal(sanitized, serverSanitizer(unsafeName));
  assert.equal(sanitized, "Ada system O'Neil-Çelik");
  assert.ok(sanitized.length <= 32);
});

test("server and client delivery gates enforce names, placeholders and frightening outcomes", () => {
  const aiEngineSource = fs.readFileSync(
    new URL("./aiEngine.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /isValidAdaptation\(candidate, lang, localeConfig, recentFortunes, name\)/,
  );
  assert.match(source, /hasAtMostOnePersonalName\(prediction, name, lang\)/);
  assert.match(source, /!hasInvalidFortuneToken\(prediction\)/);
  assert.match(source, /!hasFrighteningOutcome\(prediction, lang\)/);
  assert.match(aiEngineSource, /const expectedName = sanitizeFortuneName\(profile\.name\)/);
  assert.match(
    aiEngineSource,
    /isFortuneSafe\(cloudResult\?\.prediction, lang, expectedName\)/,
  );
  assert.match(aiEngineSource, /hasAtMostOnePersonalName\(text, expectedName, lang\)/);
  assert.match(aiEngineSource, /hasInvalidFortuneToken\(text\)/);
  assert.match(aiEngineSource, /hasFrighteningOutcome\(text, lang\)/);
});

test("active AI validation keeps hard safety gates and bounds semantic review", () => {
  const validatorSource = source.slice(
    source.indexOf("function isValidAdaptation"),
    source.indexOf("function recipeUsageScore"),
  );
  const generateFortuneSource = source.slice(
    source.indexOf("exports.generateFortune = onCall"),
    source.indexOf("const FORTUNE_EVENT_TYPES"),
  );

  assert.doesNotMatch(validatorSource, /hasUpliftingTone/);
  assert.doesNotMatch(validatorSource, /hasFortuneNegation/);
  assert.match(validatorSource, /hasAtMostOnePersonalName/);
  assert.match(validatorSource, /isLikelyLanguage/);
  assert.match(validatorSource, /SHARING_BAIT_OUTPUT/);
  assert.match(generateFortuneSource, /selectApprovedFortune/);
  assert.match(generateFortuneSource, /attempts: FORTUNE_CANDIDATE_ATTEMPTS/);
  assert.match(source, /FORTUNE_CANDIDATE_ATTEMPTS = 2/);
  assert.match(source, /GENERATION_DEADLINE_MS = 8_000/);
  assert.match(source, /JUDGE_DEADLINE_MS = 4_000/);
  assert.match(source, /httpOptions:[\s\S]*?timeout: remainingMs/);
  assert.match(source, /runWithDeadline/);
  assert.match(generateFortuneSource, /requestFortuneJudgment/);
  assert.ok(
    generateFortuneSource.indexOf("isLocallyValid") <
      generateFortuneSource.indexOf("judgeCandidate"),
    "the semantic judge must run only after local gates",
  );
  assert.doesNotMatch(generateFortuneSource, /bestSafeCandidate/);
  assert.match(generateFortuneSource, /if \(!prediction\) \{/);
  assert.match(generateFortuneSource, /Gemini did not return a safe, original fortune/);
  assert.match(generateFortuneSource, /await releaseAiUsage\(uid, requestId, modelUsage\)/);
  assert.match(generateFortuneSource, /new HttpsError\(\s*"unavailable"/);
});

test("rewarded and premium AI share private novelty history", () => {
  assert.match(source, /persistNoveltyHistory: true/);
  assert.match(source, /persistUserHistory: isPremium/);
  assert.match(source, /reservation\.persistNoveltyHistory\s*\? await getRecentAiFortunes\(uid\)/);
  assert.match(source, /if \(reservation\.persistNoveltyHistory\) \{\s*await rememberAiFortune/);
  assert.match(source, /reservation\.persistUserHistory/);

  const historyCallable = source.slice(
    source.indexOf("exports.getMyFortuneHistory = onCall"),
    source.indexOf("const legacyGenerateFortune"),
  );
  assert.doesNotMatch(historyCallable, /getRecentAiFortunes/);
  assert.doesNotMatch(historyCallable, /aiItems/);
});

test("fortune generation rotates message forms and reviews a deeper history", () => {
  assert.match(source, /const AI_HISTORY_LIMIT = 24/);
  assert.match(source, /const RECIPE_DIMENSIONS/);
  assert.match(source, /weightedRecipeChoice/);
  assert.match(source, /recipeUsageScore/);
  assert.match(source, /recently used choice cools down/);
  assert.match(source, /SELECTED RECIPE/);
  assert.match(source, /hopeful possibility without guaranteeing/);
  assert.match(source, /organic emotional resonance/);
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
  assert.match(localeSource, /sounds originally written in Turkish/);
  assert.match(localeSource, /natural Turkish word order/);
});
