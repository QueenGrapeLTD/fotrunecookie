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

function fitWrappedText(ctx, text, {
  x, top, width, height, maxSize, minSize, lineHeightRatio = 1.35,
  fontFamily = 'Georgia, serif', fontStyle = '', fontWeight = '600'
}) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${fontStyle} ${fontWeight} ${size}px ${fontFamily}`.trim();
    const words = cleanText.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    const lineHeight = size * lineHeightRatio;
    if (lines.length * lineHeight <= height) {
      const firstY = top + ((height - lines.length * lineHeight) / 2) + size;
      lines.forEach((item, index) => ctx.fillText(item, x, firstY + index * lineHeight));
      return;
    }
  }

  ctx.font = `${fontStyle} ${fontWeight} ${minSize}px ${fontFamily}`.trim();
  const words = cleanText.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const lineHeight = minSize * lineHeightRatio;
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let lastLine = `${visibleLines[maxLines - 1]}…`;
    while (lastLine.length > 1 && ctx.measureText(lastLine).width > width) {
      lastLine = `${lastLine.slice(0, -2).trim()}…`;
    }
    visibleLines[maxLines - 1] = lastLine;
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
