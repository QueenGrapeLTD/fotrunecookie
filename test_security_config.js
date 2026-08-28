import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rulesSource = fs.readFileSync(
  new URL("./firestore.rules", import.meta.url),
  "utf8",
);
const functionsSource = fs.readFileSync(
  new URL("./functions/index.js", import.meta.url),
  "utf8",
);
const authSource = fs.readFileSync(
  new URL("./firebaseService.js", import.meta.url),
  "utf8",
);
const androidManifest = fs.readFileSync(
  new URL("./android/app/src/main/AndroidManifest.xml", import.meta.url),
  "utf8",
);
const androidFilePaths = fs.readFileSync(
  new URL("./android/app/src/main/res/xml/file_paths.xml", import.meta.url),
  "utf8",
);
const androidBuild = fs.readFileSync(
  new URL("./android/app/build.gradle", import.meta.url),
  "utf8",
);
const aiEngineSource = fs.readFileSync(
  new URL("./aiEngine.js", import.meta.url),
  "utf8",
);
const fortuneAdminHtml = fs.readFileSync(
  new URL("./fortunes_admin.html", import.meta.url),
  "utf8",
);

test("Firestore profile identity is bound to the verified auth token", () => {
  assert.match(rulesSource, /function validAuthIdentity\(\)/);
  assert.match(rulesSource, /request\.resource\.data\.email == request\.auth\.token\.email/);
  assert.match(
    rulesSource,
    /request\.resource\.data\.emailVerified == request\.auth\.token\.email_verified/,
  );
  const updateAllowlist = rulesSource.slice(
    rulesSource.indexOf("function validUserUpdate"),
    rulesSource.indexOf("function validProfileData"),
  );
  assert.doesNotMatch(updateAllowlist, /'email'/);
  assert.doesNotMatch(updateAllowlist, /'emailVerified'/);
  assert.doesNotMatch(updateAllowlist, /'authProvider'/);
});

test("public settings cannot be written directly or leak the admin UID", () => {
  assert.match(
    rulesSource,
    /match \/settings\/app_config \{[\s\S]*?allow read: if true;[\s\S]*?allow write: if false;/,
  );
  assert.match(
    rulesSource,
    /match \/public_config\/\{docId\} \{[\s\S]*?allow read, write: if false;/,
  );
  const updateSettings = functionsSource.slice(
    functionsSource.indexOf("exports.adminUpdateAppSettings"),
    functionsSource.indexOf("exports.adminSetPremium"),
  );
  assert.match(updateSettings, /updatedBy: FieldValue\.delete\(\)/);
  assert.doesNotMatch(updateSettings, /updatedBy: adminUid/);
});

test("native App Check does not depend on a web reCAPTCHA site key", () => {
  assert.match(authSource, /if \(appCheckEnabled\) \{\s*if \(Capacitor\.isNativePlatform\(\)\)/);
  assert.match(authSource, /FirebaseAppCheck\.initialize/);
  assert.match(authSource, /else if \(appCheckSiteKey\)/);
});

test("Android production data and signing boundaries are hardened", () => {
  assert.match(androidManifest, /android:allowBackup="false"/);
  assert.match(androidManifest, /android:fullBackupContent="false"/);
  assert.match(androidManifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(androidFilePaths, /<external-path/);
  const debugBlock = androidBuild.slice(
    androidBuild.indexOf("buildTypes"),
    androidBuild.indexOf("gradle.taskGraph"),
  );
  assert.doesNotMatch(debugBlock, /debug\s*\{[\s\S]*signingConfig/);
  assert.match(androidBuild, /task\.path == ':app:assembleRelease'/);
});

test("Gemini secrets and direct generation stay on the server", () => {
  assert.doesNotMatch(aiEngineSource, /callGeminiDirect/);
  assert.doesNotMatch(aiEngineSource, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(aiEngineSource, /options\.apiKey/);
  assert.doesNotMatch(fortuneAdminHtml, /id="ai-api-key"/);
  assert.doesNotMatch(fortuneAdminHtml, /id="ai-provider"/);
  assert.equal(fs.existsSync(new URL("./admin_logic.js", import.meta.url)), false);
});
