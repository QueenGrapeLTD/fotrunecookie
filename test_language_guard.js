import test from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyLanguage } from './languageGuard.js';

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
