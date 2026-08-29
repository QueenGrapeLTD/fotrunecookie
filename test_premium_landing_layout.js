import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('./i18n.js', import.meta.url), 'utf8');

test('premium landing owns distinct idle, crack and opening artwork', () => {
  assert.match(html, /cookie-premium-idle-v2\.png/);
  assert.match(html, /cookie-premium-crack-v2\.png/);
  assert.match(html, /cookie-premium-open-v2\.png/);
  assert.match(css, /\.premium-experience #state-landing\[data-cookie-stage="second"\] \.premium-cookie-frame-crack/);
  assert.match(css, /\.premium-experience #state-landing\[data-cookie-stage="opening"\] \.premium-cookie-frame-open/);
});

test('premium presentation stages do not replace the free entitlement flow', () => {
  assert.match(main, /document\.documentElement\.classList\.toggle\('premium-experience', isPremium\)/);
  assert.match(main, /function updatePremiumLandingStage\(stage = 'idle'\)/);
  assert.match(main, /if \(document\.documentElement\.classList\.contains\('premium-experience'\)\)[\s\S]*?else \{\s*showToast\(t\('firstCrack'\)\)/);
  assert.match(main, /isPremium \|\| hasAdCredit/);
});

test('premium stage copy is localized and preparation status stays inline', () => {
  assert.match(i18n, /lastTouch:\s*\[[^\]]+\]/);
  assert.match(i18n, /magicAppearing:\s*\[[^\]]+\]/);
  assert.match(main, /updatePremiumLandingStage\('opening'\)/);
  assert.match(css, /\.premium-experience \.ai-fortune-loading-badge\s*\{[\s\S]*?grid-template-columns:\s*43px minmax\(0, 1fr\)/);
});
