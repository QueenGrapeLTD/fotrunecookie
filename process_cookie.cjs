const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = 'C:\\Users\\AtakanCelik\\.gemini\\antigravity-ide\\brain\\d19b54fe-4adf-4f1d-8860-92878cb682a8\\whole_unbroken_cookie_1784991278311.png';
const publicDir = 'c:\\Users\\AtakanCelik\\Downloads\\cocky said\\public';

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function processImage() {
  console.log('Refining unbroken cookie alpha channel...');
  const image = sharp(inputPath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const outputBuffer = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];

      let isBg = false;
      // White background threshold
      if (r > 210 && g > 210 && b > 210) {
        isBg = true;
      }
      // Center bottom floor shadow patch removal
      if (y > height * 0.70 && x > width * 0.28 && x < width * 0.72) {
        if (r > 160 && g > 150 && b > 140 && (r - g) < 25) {
          isBg = true;
        }
      }

      const idx = i * 4;
      outputBuffer[idx] = r;
      outputBuffer[idx + 1] = g;
      outputBuffer[idx + 2] = b;
      outputBuffer[idx + 3] = isBg ? 0 : 255;
    }
  }

  // Save trimmed full cookie image
  await sharp(outputBuffer, { raw: { width, height, channels: 4 } })
    .trim()
    .toFile(path.join(publicDir, 'cookie_full.png'));

  console.log('Saved 100% clean cookie_full.png!');

  // Now create Left Half and Right Half
  const trimmed = sharp(path.join(publicDir, 'cookie_full.png'));
  const trimmedMeta = await trimmed.metadata();
  const w = trimmedMeta.width;
  const h = trimmedMeta.height;
  const rawTrimmed = await trimmed.raw().toBuffer({ resolveWithObject: true });

  const leftBuffer = Buffer.alloc(w * h * 4);
  const rightBuffer = Buffer.alloc(w * h * 4);

  // Organic crack line down exact middle
  for (let y = 0; y < h; y++) {
    const wiggle = Math.sin(y / 18) * 3;
    const splitX = Math.floor(w * 0.50 + wiggle);

    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = rawTrimmed.data[idx];
      const g = rawTrimmed.data[idx + 1];
      const b = rawTrimmed.data[idx + 2];
      const a = rawTrimmed.data[idx + 3];

      if (x <= splitX) {
        leftBuffer[idx] = r;
        leftBuffer[idx + 1] = g;
        leftBuffer[idx + 2] = b;
        leftBuffer[idx + 3] = a;

        rightBuffer[idx + 3] = 0;
      } else {
        rightBuffer[idx] = r;
        rightBuffer[idx + 1] = g;
        rightBuffer[idx + 2] = b;
        rightBuffer[idx + 3] = a;

        leftBuffer[idx + 3] = 0;
      }
    }
  }

  await sharp(leftBuffer, { raw: { width: w, height: h, channels: 4 } })
    .toFile(path.join(publicDir, 'cookie_left.png'));

  await sharp(rightBuffer, { raw: { width: w, height: h, channels: 4 } })
    .toFile(path.join(publicDir, 'cookie_right.png'));

  console.log('Saved clean cookie_left.png and cookie_right.png!');
}

processImage().catch(console.error);
