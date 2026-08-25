import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('reflection ritual provides reactions, private note and journal save action', () => {
  assert.match(html, /id="reflection-ritual"/);
  assert.match(html, /data-reaction="keep"/);
  assert.match(html, /data-reaction="act"/);
  assert.match(html, /data-reaction="release"/);
  assert.match(html, /id="reflection-note"[^>]+maxlength="500"/);
  assert.match(main, /updateFortuneInHistory/);
});

test('iOS experience removes astrology surfaces from the primary journey', () => {
  assert.match(main, /platform-ios/);
  assert.match(main, /getFortuneProfileForPlatform/);
  assert.match(css, /html\.platform-ios \.profile-section-birth/);
  assert.match(css, /html\.platform-ios #zodiac-active-badge/);
});

test('journal view exposes lasting-value summary metrics', () => {
  assert.match(html, /id="journey-total"/);
  assert.match(html, /id="journey-reflections"/);
  assert.match(html, /id="journey-streak"/);
});
