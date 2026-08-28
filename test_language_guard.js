import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isLikelyLanguage } from './languageGuard.js';
import { fortunesDatabase } from './fortunesData.js';

const require = createRequire(import.meta.url);
const { isLikelyLanguage: isLikelyServerLanguage } = require('./functions/fortuneLanguage.js');

function assertLanguageResult(text, language, expected) {
  assert.equal(isLikelyLanguage(text, language), expected, `client ${language}`);
  assert.equal(isLikelyServerLanguage(text, language), expected, `server ${language}`);
}

test('German selection rejects a Turkish fortune', () => {
  const turkish = 'Mutfağın kuytu köşesinde unuttuğun eski baharat kavanozu, bugün sofrana sıcak bir davet taşıyor.';
  assert.equal(isLikelyLanguage(turkish, 'de'), false);
  assert.equal(isLikelyLanguage(turkish, 'tr'), true);
});

test('Italian selection rejects an English fortune', () => {
  const english = 'The scent of worn book pages stays with your fingers while you write a quiet confession.';
  assert.equal(isLikelyLanguage(english, 'it'), false);
  assert.equal(isLikelyLanguage(english, 'en'), true);
});

test('script-based languages require their own writing system', () => {
  assert.equal(isLikelyLanguage('오늘의 작은 친절이 새로운 대화를 엽니다.', 'ko'), true);
  assert.equal(isLikelyLanguage('今日の小さな選択が、心に余白を作ります。', 'ja'), true);
  assert.equal(isLikelyLanguage('今天的一次耐心倾听，会带来温暖的回应。', 'zh'), true);
  assert.equal(isLikelyLanguage('A quiet choice can make room for a warmer answer.', 'ja'), false);
});

test('client and server accept natural fixtures in all supported languages', () => {
  const fixtures = {
    tr: 'Bugün güzel bir fırsat sana sıcak bir gülümseme getirebilir.',
    en: 'A welcome opportunity can bring warmth to your day.',
    de: 'Eine schöne Chance bringt heute Freude und Zuversicht.',
    fr: 'Une belle surprise apporte de la joie et un sourire chaleureux.',
    es: 'Una hermosa oportunidad trae alegría y una sonrisa cálida.',
    it: 'Una bella opportunità porta gioia e un sorriso sincero.',
    el: 'Μια όμορφη ευκαιρία φέρνει χαρά και ζεστό χαμόγελο.',
    zh: '一个美好的机会，会给今天带来温暖和惊喜。',
    ja: '素敵な機会が、今日に温かい喜びを運びます。',
    ko: '좋은 기회가 오늘에 따뜻한 기쁨과 미소를 더합니다.',
  };

  for (const [language, text] of Object.entries(fixtures)) {
    assertLanguageResult(text, language, true);
  }
});

test('marker-free English cannot pass as another Latin language', () => {
  const english = 'Bright horizons bloom soon.';
  assertLanguageResult(english, 'en', true);
  for (const language of ['tr', 'de', 'fr', 'es', 'it']) {
    assertLanguageResult(english, language, false);
  }
});

test('all authoritative curated fortunes pass both language guards', () => {
  for (const [language, categories] of Object.entries(fortunesDatabase)) {
    for (const messages of Object.values(categories)) {
      for (const message of messages) {
        assertLanguageResult(message, language, true);
      }
    }
  }
});
