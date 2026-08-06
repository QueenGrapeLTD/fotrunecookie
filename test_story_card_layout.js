import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const exporter = fs.readFileSync(new URL('./cardExporter.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('result numbers stay locked to the six artwork medallions', () => {
  assert.match(css, /\.numbers-grid\s*\{[\s\S]*?top:\s*4\.2cqw/);
  assert.match(css, /\.number-badge\s*\{[\s\S]*?animation-name:\s*popNumberLocked/);
  assert.match(css, /transform:\s*translate\(-50%,\s*-50%\)\s*scale\(1\)/);

  for (const center of ['18%', '30.86%', '43.65%', '56.45%', '69.34%', '82.03%']) {
    assert.ok(css.includes(`left: ${center}`), `Missing fixed medallion center ${center}`);
  }
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
