import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "store-assets", "ios-6.5");

const screenshots = [
  {
    input: "phone-01-home.final.png",
    output: "01-cookie-home-1242x2688.png",
    title: "Kurabiyeni Kır",
    subtitle: "Her gün yeni bir şans mesajı keşfet.",
  },
  {
    input: "phone-03-profile.final.png",
    output: "02-ai-fortune-1242x2688.png",
    title: "Sana Özel AI Yorumu",
    subtitle: "Mesajını ve şanslı sayılarını anında gör.",
  },
];

const escapeXml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

await fs.mkdir(outputDir, { recursive: true });

for (const item of screenshots) {
  const inputPath = path.join(root, "store-assets", item.input);
  const outputPath = path.join(outputDir, item.output);
  const screenshot = await sharp(inputPath)
    .resize({ width: 1152, height: 2048, fit: "fill" })
    .png()
    .toBuffer();

  const header = Buffer.from(`
    <svg width="1242" height="2688" xmlns="http://www.w3.org/2000/svg">
      <rect width="1242" height="2688" fill="#fff8eb"/>
      <text x="621" y="170" text-anchor="middle" fill="#9a3412"
        font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="700">${escapeXml(item.title)}</text>
      <text x="621" y="265" text-anchor="middle" fill="#6b4f3a"
        font-family="Arial, Helvetica, sans-serif" font-size="42">${escapeXml(item.subtitle)}</text>
      <rect x="45" y="360" width="1152" height="2048" rx="44" fill="#ffffff"/>
      <text x="621" y="2545" text-anchor="middle" fill="#c2410c"
        font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700">FORTUNE COOKIE AI</text>
    </svg>
  `);

  await sharp(header)
    .composite([{ input: screenshot, left: 45, top: 360 }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(path.relative(root, outputPath));
}
