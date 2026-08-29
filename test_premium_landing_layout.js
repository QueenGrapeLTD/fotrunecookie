import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('./i18n.js', import.meta.url), 'utf8');
const ads = fs.readFileSync(new URL('./adManager.js', import.meta.url), 'utf8');
const cookieStageFunction = main.match(
  /function updateCookieLandingStage[\s\S]*?(?=\r?\nfunction resetCookieTapProgress)/,
)?.[0] || '';

test('approved cookie composition is account-neutral and owns every artwork stage', () => {
  assert.match(html, /<html lang="tr" class="approved-cookie-stage">/);
  assert.match(html, /cookie-premium-idle-v2\.png/);
  assert.match(html, /cookie-premium-crack-v2\.png/);
  assert.match(html, /cookie-premium-open-v2\.png/);
  assert.match(css, /\.approved-cookie-stage #state-landing\[data-cookie-stage="second"\] \.premium-cookie-frame-crack/);
  assert.match(css, /\.approved-cookie-stage #state-landing\[data-cookie-stage="opening"\] \.premium-cookie-frame-open/);
  assert.doesNotMatch(css, /\.premium-experience .*premium-cookie-frame/);
});

test('premium membership remains entitlement state rather than composition state', () => {
  assert.match(main, /classList\.toggle\('premium-experience', isPremium\)/);
  assert.match(main, /isPremium \|\| hasAdCredit/);
  assert.match(main, /if \(isPremium\) \{[\s\S]*?premiumUsed[\s\S]*?MAX_PREMIUM_DAILY_CRACKS/);
  assert.match(main, /else \{[\s\S]*?hasAdQuery[\s\S]*?MAX_FREE_DAILY_CRACKS/);
  assert.doesNotMatch(main, /classList\.toggle\('approved-cookie-stage'/);
});

test('shared cookie stages use localized inline feedback for every account', () => {
  assert.match(i18n, /lastTouch:\s*\[[^\]]+\]/);
  assert.match(i18n, /magicAppearing:\s*\[[^\]]+\]/);
  assert.match(main, /function updateCookieLandingStage\(stage = 'idle'\)/);
  assert.doesNotMatch(cookieStageFunction, /premium-experience/);
  assert.match(main, /cookieTapCount === 1[\s\S]*?updateCookieLandingStage\('first'\)/);
  assert.match(main, /cookieTapCount === 2[\s\S]*?updateCookieLandingStage\('second'\)/);
  assert.match(main, /updateCookieLandingStage\('opening'\)/);
  assert.match(css, /\.approved-cookie-stage \.ai-fortune-loading-badge\s*\{[\s\S]*?grid-template-columns:\s*43px minmax\(0, 1fr\)/);
});

test('premium active membership has a distinct visible and accessible indicator', () => {
  assert.match(main, /setAttribute\('aria-pressed', 'true'\)/);
  assert.match(main, /labelText\.textContent = 'Premium ✓'/);
  assert.match(css, /\.premium-experience \.premium-top-btn\.premium-active-green\s*\{[\s\S]*?#208a6b[\s\S]*?#12715a/);
});

test('shared sparkle effects respect reduced motion', () => {
  assert.match(html, /class="cookie-sparkles" aria-hidden="true"/);
  assert.match(css, /\.approved-cookie-stage \.real-cookie-wrapper \.cookie-magic-burst\s*\{\s*visibility:\s*visible/);
  assert.match(css, /#state-landing\[data-cookie-stage="opening"\] \.cookie-sparkles/);
  assert.match(css, /@keyframes premiumSparkleOpening/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.approved-cookie-stage \.cookie-sparkles \.c-star/);
  assert.doesNotMatch(css, /(^|\n)\.ambient-sparkles\s*\{[^}]*premium/s);
});

test('approved landing height accounts for measured banner and active status rail', () => {
  assert.match(ads, /BannerAdPluginEvents\.SizeChanged/);
  assert.match(ads, /setProperty\(\s*["']--native-ad-banner-height["']/);
  assert.match(css, /html\.native-ad-banner-visible\s*\{[\s\S]*?--native-ad-reserve:\s*calc\(var\(--native-ad-banner-height, 50px\) \+ 10px\)/);
  assert.match(
    css,
    /:root\s*\{[\s\S]*?--native-ad-reserve:\s*0px;[\s\S]*?--status-layout-reserve:\s*0px;/,
  );
  assert.match(css, /html\.app-status-visible\s*\{\s*--status-layout-reserve:\s*var\(--status-rail-reserve\);/);
  assert.match(
    css,
    /\.approved-cookie-stage #state-landing\s*\{[\s\S]*?min-height:\s*calc\([\s\S]*?var\(--native-ad-reserve\) - var\(--status-layout-reserve\)[\s\S]*?\);/,
  );
  assert.doesNotMatch(css, /native-ad-banner-visible #state-result \.action-buttons/);
  assert.doesNotMatch(css, /native-ad-banner-visible \.landing-bottom-actions/);
  assert.match(css, /\.toast\s*\{[\s\S]*?bottom:\s*calc\(12px \+ var\(--safe-area-bottom\) \+ var\(--native-ad-reserve\)\)/);
});
