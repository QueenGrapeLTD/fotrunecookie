import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fortunesDatabase } from './fortunesData.js';

const require = createRequire(import.meta.url);
const {
  BUNDLED_FORTUNE_CONTENT,
  buildAdaptationPrompt,
  normalizeContentDocument,
  selectApprovedContent,
} = require('./functions/fortuneContent.js');

const languages = ['tr', 'en', 'de', 'fr', 'es', 'it', 'el', 'zh', 'ja', 'ko'];

test('curated content library covers all supported languages and categories', () => {
  assert.equal(BUNDLED_FORTUNE_CONTENT.length, 160);
  for (const lang of languages) {
    const items = BUNDLED_FORTUNE_CONTENT.filter((item) => item.lang === lang);
    assert.equal(items.length, 16, `${lang} should have 16 curated messages`);
    for (const category of ['general', 'love', 'career', 'health']) {
      assert.equal(
        items.filter((item) => item.category === category).length,
        4,
        `${lang}/${category} should have four curated messages`,
      );
    }
  }
});

test('every curated message fits the story card contract', () => {
  for (const item of BUNDLED_FORTUNE_CONTENT) {
    assert.ok(item.text.length >= 15, `${item.id} is too short`);
    assert.ok(item.text.length <= 80, `${item.id} exceeds 80 characters`);
    assert.equal(item.status, 'approved');
    assert.equal(item.qualityScore, 5);
  }
});

test('client fortune data exactly matches the authoritative bundled source', () => {
  const expected = {};
  for (const item of BUNDLED_FORTUNE_CONTENT) {
    expected[item.lang] ||= {};
    expected[item.lang][item.category] ||= [];
    expected[item.lang][item.category].push(item.text);
  }
  assert.deepEqual(fortunesDatabase, expected);
});

test('recent content is cooled down during selection', () => {
  const trItems = BUNDLED_FORTUNE_CONTENT.filter(
    (item) => item.lang === 'tr' && item.category === 'general',
  );
  const selected = selectApprovedContent({
    lang: 'tr',
    category: 'general',
    recentContentIds: trItems.slice(0, 3).map((item) => item.id),
    recentTexts: trItems.slice(0, 3).map((item) => item.text),
    random: () => 0,
  });
  assert.equal(selected.id, trItems[3].id);
});

test('an unseen anchor is always preferred over a recent exact repeat', () => {
  const trItems = BUNDLED_FORTUNE_CONTENT.filter((item) => item.lang === 'tr');
  const selected = selectApprovedContent({
    lang: 'tr',
    category: 'general',
    recentContentIds: trItems.slice(0, 15).map((item) => item.id),
    recentTexts: trItems.slice(0, 15).map((item) => item.text),
    random: () => 0,
  });
  assert.equal(selected.id, trItems[15].id);
});

test('a cloud rejection overrides the matching bundled message', () => {
  const blocked = BUNDLED_FORTUNE_CONTENT[0];
  const selected = selectApprovedContent({
    lang: blocked.lang,
    category: blocked.category,
    cloudContent: [{ ...blocked, status: 'rejected' }],
    recentContentIds: BUNDLED_FORTUNE_CONTENT
      .filter((item) => item.lang === blocked.lang && item.id !== blocked.id)
      .map((item) => item.id),
    random: () => 0,
  });
  assert.notEqual(selected.id, blocked.id);
});

test('content documents and adaptation prompts enforce the bounded editor role', () => {
  assert.equal(
    normalizeContentDocument('bad', { text: 'x'.repeat(81), lang: 'en' }),
    null,
  );
  const seed = BUNDLED_FORTUNE_CONTENT.find((item) => item.lang === 'en');
  const prompt = buildAdaptationPrompt({
    seed,
    languageName: 'English',
    locale: 'en-US',
    recentTexts: [],
  });
  assert.match(prompt, /approved meaning anchor/i);
  assert.match(prompt, /25 to 80 Unicode characters/);
  assert.match(prompt, /No command/);
  assert.match(prompt, /return the anchor unchanged/i);
});
