// Shared 1024x1536 result/story renderer.
// The same artwork is used by the in-app result card and exported story image.

const TEMPLATE_URL = '/fortunecookie_story_template.png';

const storyTranslations = {
  tr: { title: 'ŞANS KURABİYESİ', luckyNumbers: 'ŞANSLI SAYILAR', forUser: (name) => `${name} için` },
  en: { title: 'FORTUNE COOKIE', luckyNumbers: 'LUCKY NUMBERS', forUser: (name) => `For ${name}` },
  fr: { title: 'BISCUIT DE FORTUNE', luckyNumbers: 'NUMÉROS CHANCEUX', forUser: (name) => `Pour ${name}` },
  de: { title: 'GLÜCKSKEKS', luckyNumbers: 'GLÜCKSZAHLEN', forUser: (name) => `Für ${name}` },
  es: { title: 'GALLETA DE LA FORTUNA', luckyNumbers: 'NÚMEROS DE LA SUERTE', forUser: (name) => `Para ${name}` },
  it: { title: 'BISCOTTO DELLA FORTUNA', luckyNumbers: 'NUMERI FORTUNATI', forUser: (name) => `Per ${name}` },
  el: { title: 'ΜΠΙΣΚΟΤΟ ΤΥΧΗΣ', luckyNumbers: 'ΤΥΧΕΡΟΙ ΑΡΙΘΜΟΙ', forUser: (name) => `Για ${name}` },
  zh: { title: '幸运饼干', luckyNumbers: '幸运数字', forUser: (name) => `致 ${name}` },
  ja: { title: 'フォーチュンクッキー', luckyNumbers: 'ラッキーナンバー', forUser: (name) => `${name} へ` },
  ko: { title: '포춘 쿠키', luckyNumbers: '행운의 숫자', forUser: (name) => `${name} 님을 위해` }
};

let templatePromise;

function loadTemplate() {
  if (!templatePromise) {
    templatePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Şans Kurabiyesi kart şablonu yüklenemedi.'));
      image.src = TEMPLATE_URL;
    });
  }
  return templatePromise;
}

function graphemes(value) {
  const text = String(value || '');
  if (typeof Intl?.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map(({ segment }) => segment);
  }
  return Array.from(text);
}

function splitOversizedToken(ctx, token, width) {
  const lines = [];
  let line = '';
  for (const grapheme of graphemes(token)) {
    const candidate = `${line}${grapheme}`;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line);
      line = grapheme;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function wrapMeasuredText(ctx, text, width) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];

  const lines = [];
  let line = '';
  for (const word of cleanText.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line);
      line = '';
    }

    if (ctx.measureText(word).width > width) {
      const fragments = splitOversizedToken(ctx, word, width);
      lines.push(...fragments.slice(0, -1));
      line = fragments.at(-1) || '';
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitLineWithEllipsis(ctx, line, width) {
  const units = graphemes(line);
  while (units.length && ctx.measureText(`${units.join('').trimEnd()}…`).width > width) {
    units.pop();
  }
  return `${units.join('').trimEnd()}…`;
}

export function fitWrappedText(ctx, text, {
  x, top, width, height, maxSize, minSize, lineHeightRatio = 1.35,
  fontFamily = 'Georgia, serif', fontStyle = '', fontWeight = '600'
}) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${fontStyle} ${fontWeight} ${size}px ${fontFamily}`.trim();
    const lines = wrapMeasuredText(ctx, cleanText, width);
    const lineHeight = size * lineHeightRatio;
    if (lines.length * lineHeight <= height) {
      const firstY = top + ((height - lines.length * lineHeight) / 2) + size;
      lines.forEach((item, index) => ctx.fillText(item, x, firstY + index * lineHeight));
      return;
    }
  }

  ctx.font = `${fontStyle} ${fontWeight} ${minSize}px ${fontFamily}`.trim();
  const lines = wrapMeasuredText(ctx, cleanText, width);

  const lineHeight = minSize * lineHeightRatio;
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    visibleLines[maxLines - 1] = fitLineWithEllipsis(
      ctx,
      visibleLines[maxLines - 1],
      width,
    );
  }
  const firstY = top + ((height - visibleLines.length * lineHeight) / 2) + minSize;
  visibleLines.forEach((item, index) => ctx.fillText(item, x, firstY + index * lineHeight));
}

export async function generateStoryCardCanvas({
  quote, luckyNumbers = [], zodiacIcon, zodiacName, userName, lang = 'en',
  brandName = 'Fortune Cookie AI', socialHandle = '@fortunecookieai'
}) {
  const t = storyTranslations[lang] || storyTranslations.en;
  const template = await loadTemplate();
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Message box safe area in the new 2:3 artwork.
  ctx.fillStyle = '#74483F';
  fitWrappedText(ctx, `“${quote || ''}”`, {
    x: 512,
    top: 972,
    width: 730,
    height: 255,
    maxSize: 43,
    minSize: 27,
    lineHeightRatio: 1.3,
    fontStyle: 'italic',
    fontWeight: '600'
  });

  // The supplied artwork contains a Turkish placeholder heading. Cover it
  // and draw the selected language so exported cards never mix languages.
  ctx.fillStyle = 'rgba(255, 246, 229, 0.97)';
  ctx.beginPath();
  ctx.roundRect(238, 1312, 548, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#D26A63';
  ctx.font = '800 27px Outfit, Arial, sans-serif';
  ctx.fillText(t.luckyNumbers, 512, 1347);

  // Six fixed number circles in the artwork.
  const numberCenters = [184, 316, 447, 578, 710, 840];
  ctx.fillStyle = '#B4514D';
  ctx.font = '700 34px Outfit, Arial, sans-serif';
  luckyNumbers.slice(0, 6).forEach((number, index) => {
    const value = Number(number);
    ctx.fillText(value < 10 ? `0${value}` : String(value), numberCenters[index], 1432);
  });

  // Permanent artwork watermark: the brand survives downloads, reposts and
  // social platforms that discard the share-sheet caption.
  const safeBrandName = String(brandName || 'Fortune Cookie AI').trim().slice(0, 40);
  const safeSocialHandle = String(socialHandle || '@fortunecookieai')
    .trim().replace(/[^@a-zA-Z0-9._]/g, '').slice(0, 40) || '@fortunecookieai';
  ctx.fillStyle = 'rgba(255, 248, 238, 0.88)';
  ctx.beginPath();
  ctx.roundRect(284, 1481, 456, 39, 20);
  ctx.fill();
  ctx.fillStyle = 'rgba(116, 72, 63, 0.92)';
  ctx.font = '700 19px Outfit, Arial, sans-serif';
  ctx.fillText(`${safeBrandName}  •  ${safeSocialHandle}`, 512, 1507);

  return canvas;
}
