import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('unintended reflection journal is absent from the result flow', () => {
  assert.doesNotMatch(html, /reflection-ritual|reflection-note|btn-save-reflection/);
  assert.doesNotMatch(main, /saveCurrentReflection|updateFortuneInHistory|reflection_saved/);
  assert.doesNotMatch(css, /\.reflection-ritual|\.reflection-reaction|#reflection-note/);
});

test('iOS experience removes astrology surfaces from the primary journey', () => {
  assert.match(main, /platform-ios/);
  assert.match(main, /getFortuneProfileForPlatform/);
  assert.match(css, /html\.platform-ios \.profile-section-birth/);
  assert.match(css, /html\.platform-ios #zodiac-active-badge/);
});

test('history remains available without reflection journey surfaces', () => {
  assert.match(html, /id="history-title-text"/);
  assert.match(html, /id="history-list-container"/);
  assert.doesNotMatch(html, /journey-summary|journey-reflections|My Reflection Journey/);
  assert.match(main, /texts\.historyTitle/);
});
