import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fitWrappedText, wrapMeasuredText } from './cardExporter.js';

const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const exporter = fs.readFileSync(new URL('./cardExporter.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const resultCss = css.slice(
  css.indexOf('IN-APP FORTUNE RESULT'),
  css.indexOf('APPLE LIQUID GLASS MODAL SYSTEM'),
);

test('in-app result is responsive and independent from the story export coordinates', () => {
  assert.match(html, /class="result-portrait"[\s\S]*?src="\/result-grandma-premium-v2\.png"/);
  assert.match(html, /class="result-portrait"[\s\S]*?class="quote-wrapper"/);
  assert.match(html, /id="result-message-label"/);
  assert.match(html, /id="result-subtitle-text"/);
  assert.match(css, /#state-result \.numbers-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,/);
  assert.match(css, /#state-result \.result-portrait img\s*\{[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /#state-result \.number-badge\s*\{[^}]*border-radius:\s*13px/s);
  assert.doesNotMatch(resultCss, /aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(resultCss, /#state-result \.quote-wrapper\s*\{[^}]*position:\s*relative/s);
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

function createMeasuredContext(unitWidth = 10) {
  const drawn = [];
  return {
    drawn,
    font: '',
    measureText(value) {
      return { width: [...String(value)].length * unitWidth };
    },
    fillText(value, x, y) {
      drawn.push({ value, x, y });
    },
  };
}

test('story wrapping safely fits 200-character Latin and unspaced CJK text', () => {
  const ctx = createMeasuredContext();
  const samples = [
    'Güzel bir fırsat gününe sıcaklık katabilir. '.repeat(5).trim().slice(0, 200),
    '好運正在靠近你的日常選擇'.repeat(20).slice(0, 200),
    '小さな幸運が今日の選択を明るくします'.repeat(20).slice(0, 200),
  ];

  for (const sample of samples) {
    const lines = wrapMeasuredText(ctx, sample, 120);
    assert.ok(lines.length > 1);
    assert.ok(lines.every(line => ctx.measureText(line).width <= 120));
    assert.equal(lines.join('').replace(/\s/g, ''), sample.replace(/\s/g, ''));
  }
});

test('story overflow keeps a grapheme-safe fitted ellipsis', () => {
  const ctx = createMeasuredContext();
  const sample = `${'幸運'.repeat(99)}💫`;
  fitWrappedText(ctx, sample, {
    x: 50,
    top: 0,
    width: 50,
    height: 10,
    maxSize: 10,
    minSize: 10,
    lineHeightRatio: 1,
  });

  assert.equal(ctx.drawn.length, 1);
  assert.match(ctx.drawn[0].value, /…$/u);
  assert.ok(ctx.measureText(ctx.drawn[0].value).width <= 50);
  assert.equal(ctx.drawn[0].value.isWellFormed(), true);
});
