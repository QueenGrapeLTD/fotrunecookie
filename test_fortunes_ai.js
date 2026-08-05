import test from "node:test";
import assert from "node:assert/strict";
import { fortunesDatabase } from "./fortunesData.js";
import { escapeHtml, localDayKey, safeHttpsUrl } from "./securityUtils.js";

test("fortune database has all supported languages and categories", () => {
  const languages = ["tr", "en", "de", "fr", "es", "it", "el", "zh", "ja", "ko"];
  const categories = ["general", "love", "career", "health"];

  for (const language of languages) {
    assert.ok(fortunesDatabase[language], `missing language: ${language}`);
    for (const category of categories) {
      assert.ok(
        Array.isArray(fortunesDatabase[language][category]),
        `missing ${language}.${category}`,
      );
      assert.ok(fortunesDatabase[language][category].length > 0);
    }
  }
});

test("HTML escaping neutralizes stored script payloads", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("image URLs only accept HTTPS", () => {
  assert.equal(safeHttpsUrl("javascript:alert(1)", "/fallback"), "/fallback");
  assert.equal(safeHttpsUrl("http://example.com/a.png", "/fallback"), "/fallback");
  assert.equal(
    safeHttpsUrl("https://example.com/a.png", "/fallback"),
    "https://example.com/a.png",
  );
});

test("daily key uses local calendar date", () => {
  assert.equal(localDayKey(new Date(2026, 6, 26, 23, 30)), "2026-07-26");
});
