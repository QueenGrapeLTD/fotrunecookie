import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const exporter = fs.readFileSync(new URL('./cardExporter.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const resultCss = css.slice(
  css.indexOf('IN-APP FORTUNE RESULT'),
  css.indexOf('APPLE LIQUID GLASS MODAL SYSTEM'),
);

test('in-app result is responsive and independent from the story export coordinates', () => {
  assert.match(html, /class="result-portrait"[\s\S]*?src="\/fortunecookie_story_template\.png"/);
  assert.match(html, /class="result-portrait"[\s\S]*?class="quote-wrapper"/);
  assert.match(css, /#state-result \.numbers-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,/);
  assert.match(css, /#state-result \.result-portrait img\s*\{[\s\S]*?transform:\s*scale\(1\.25\)/);
  assert.doesNotMatch(resultCss, /aspect-ratio:\s*2\s*\/\s*3/);
  assert.doesNotMatch(resultCss, /#state-result \.quote-wrapper\s*\{[\s\S]*?position:\s*absolute/);
  assert.doesNotMatch(resultCss, /popNumberLocked/);
  assert.match(exporter, /fortunecookie_story_template\.png/);
});

test('exported story artwork carries the permanent social watermark', () => {
  assert.match(exporter, /Fortune Cookie AI/);
  assert.match(exporter, /@fortunecookieai/);
  assert.match(exporter, /ctx\.fillText\(`\$\{safeBrandName\}/);
  assert.match(main, /Fortune Cookie AI · @fortunecookieai/);
});

test('Android hides Apple sign-in while iOS and web keep the provider', () => {
  assert.match(main, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.match(main, /Capacitor\.getPlatform\(\) !== 'android'/);
  assert.match(css, /html\.platform-android \.social-btn-apple/);
});

test('story sharing exposes one share action without download or copy controls', () => {
  assert.match(html, /id="btn-share-story"/);
  assert.doesNotMatch(html, /id="btn-download-story"/);
  assert.doesNotMatch(html, /id="btn-share"/);
  assert.doesNotMatch(main, /handleDownloadStory|copyToClipboard|shareFortune/);
});
