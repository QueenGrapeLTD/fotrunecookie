import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, ".env");
const targetPath = path.join(root, "functions", ".env");
const requiredKeys = [
  "VITE_ADMOB_ANDROID_REWARDED_AD_UNIT_ID",
  "VITE_ADMOB_IOS_REWARDED_AD_UNIT_ID",
];

if (!fs.existsSync(sourcePath)) {
  throw new Error(".env bulunamadı.");
}

const env = Object.fromEntries(
  fs.readFileSync(sourcePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const adUnitIds = requiredKeys.map((key) => {
  const value = env[key] || "";
  if (!/^ca-app-pub-\d+\/\d+$/.test(value)) {
    throw new Error(`${key} geçerli bir AdMob reklam birimi değil.`);
  }
  return value;
});

fs.writeFileSync(
  targetPath,
  [
    "# Generated from the public rewarded-ad IDs in the root .env file.",
    `ADMOB_REWARDED_AD_UNIT_IDS=${adUnitIds.join(",")}`,
    "",
  ].join("\n"),
  "utf8",
);

console.log("Cloud Functions AdMob izin listesi güncellendi.");
