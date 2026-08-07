import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const expectedAppId = 'com.fortunecookieai.app';
const expectedFirebaseProjectId = 'fortunecookieai-prod';
const expectedFirebaseSenderId = '53381061591';
const expectedFirebaseWebAppId = '1:53381061591:web:a06506081fc5ef2fd04992';
const expectedFirebaseIosAppId = '1:53381061591:ios:a47ef8928c618a83d04992';
const sampleAdMobPublisher = 'ca-app-pub-3940256099942544';
const expectedAppAdsEntry =
  'google.com, pub-1148080339435668, DIRECT, f08c47fec0942fa0';
const errors = [];
const warnings = [];

function fullPath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = fullPath(relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

function plistValue(contents, key) {
  const match = contents.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  return match?.[1] || '';
}

function requireEnv(env, key) {
  if (!env[key]) errors.push(`${key} .env içinde eksik.`);
}

const env = readEnv(fullPath('.env'));
if (env.VITE_ADMOB_TEST_MODE === 'true' || process.env.VITE_ADMOB_TEST_MODE === 'true') {
  errors.push('App Store derlemesinde VITE_ADMOB_TEST_MODE etkin olamaz.');
}
if (env.VITE_DEVICE_DIAGNOSTICS === 'true' || process.env.VITE_DEVICE_DIAGNOSTICS === 'true') {
  errors.push('App Store derlemesinde VITE_DEVICE_DIAGNOSTICS etkin olamaz.');
}
for (const key of [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_REVENUECAT_IOS_API_KEY',
  'VITE_ADMOB_IOS_REWARDED_AD_UNIT_ID',
  'VITE_ADMOB_IOS_APP_OPEN_AD_UNIT_ID',
  'VITE_ADMOB_IOS_BANNER_AD_UNIT_ID',
]) {
  requireEnv(env, key);
}
if (env.VITE_FIREBASE_PROJECT_ID !== expectedFirebaseProjectId) {
  errors.push(`VITE_FIREBASE_PROJECT_ID ${expectedFirebaseProjectId} değil.`);
}
if (env.VITE_FIREBASE_MESSAGING_SENDER_ID !== expectedFirebaseSenderId) {
  errors.push(`VITE_FIREBASE_MESSAGING_SENDER_ID ${expectedFirebaseSenderId} değil.`);
}
if (env.VITE_FIREBASE_APP_ID !== expectedFirebaseWebAppId) {
  errors.push('VITE_FIREBASE_APP_ID production web uygulamasına ait değil.');
}

const functionsEnv = readEnv(fullPath('functions/.env'));
const expectedRewardedAdUnits = [
  env.VITE_ADMOB_ANDROID_REWARDED_AD_UNIT_ID,
  env.VITE_ADMOB_IOS_REWARDED_AD_UNIT_ID,
].filter(Boolean).join(',');
if (!functionsEnv.ADMOB_REWARDED_AD_UNIT_IDS) {
  errors.push(
    'functions/.env içinde ADMOB_REWARDED_AD_UNIT_IDS eksik; npm run admob:functions-env çalıştırın.',
  );
} else if (functionsEnv.ADMOB_REWARDED_AD_UNIT_IDS !== expectedRewardedAdUnits) {
  errors.push(
    'functions/.env reklam birimleri kök .env ile eşleşmiyor; npm run admob:functions-env çalıştırın.',
  );
}

if ((env.VITE_REVENUECAT_IOS_API_KEY || '').startsWith('test_')) {
  errors.push('VITE_REVENUECAT_IOS_API_KEY test anahtarı olamaz.');
}

if ((env.VITE_ADMOB_IOS_REWARDED_AD_UNIT_ID || '').startsWith(sampleAdMobPublisher)) {
  errors.push('VITE_ADMOB_IOS_REWARDED_AD_UNIT_ID Google test reklam birimi olamaz.');
}
for (const key of [
  'VITE_ADMOB_IOS_APP_OPEN_AD_UNIT_ID',
  'VITE_ADMOB_IOS_BANNER_AD_UNIT_ID',
]) {
  if ((env[key] || '').startsWith(sampleAdMobPublisher)) {
    errors.push(`${key} Google test reklam birimi olamaz.`);
  }
}

const appAdsPath = fullPath('public/app-ads.txt');
if (!fs.existsSync(appAdsPath)) {
  errors.push('public/app-ads.txt eksik; AdMob uygulama doğrulaması tamamlanamaz.');
} else if (!fs.readFileSync(appAdsPath, 'utf8').split(/\r?\n/).includes(expectedAppAdsEntry)) {
  errors.push('public/app-ads.txt beklenen AdMob yayıncı kaydını içermiyor.');
}

const project = read('ios/App/App.xcodeproj/project.pbxproj');
if (!project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${expectedAppId};`)) {
  errors.push(`Xcode bundle id ${expectedAppId} değil.`);
}
if (!project.includes('DEVELOPMENT_TEAM =')) {
  errors.push('Xcode DEVELOPMENT_TEAM ayarlı değil; Apple Developer Team seçilmeli.');
}
if (!project.includes('GoogleService-Info.plist in Resources')) {
  errors.push('GoogleService-Info.plist Xcode Copy Bundle Resources fazına ekli değil.');
}
if (!project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
  errors.push('App.entitlements Xcode hedefinin code signing ayarına bağlı değil.');
}
if (!project.includes('com.apple.SignInWithApple')) {
  errors.push('Xcode hedefinde Sign in with Apple capability etkin değil.');
}
const buildNumbers = [...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)]
  .map((match) => Number(match[1]));
if (!buildNumbers.length || buildNumbers.some((buildNumber) => buildNumber < 6)) {
  errors.push('Xcode build numarası App Store için en az 6 olmalı.');
}

const entitlements = read('ios/App/App/App.entitlements');
if (!entitlements) {
  errors.push('ios/App/App/App.entitlements bulunamadı.');
} else if (!entitlements.includes('<key>com.apple.developer.applesignin</key>') ||
  !entitlements.includes('<string>Default</string>')) {
  errors.push('App.entitlements geçerli Sign in with Apple yetkisini içermiyor.');
}

const infoPlist = read('ios/App/App/Info.plist');
if (!infoPlist) {
  errors.push('ios/App/App/Info.plist bulunamadı.');
} else {
  const admobAppId = plistValue(infoPlist, 'GADApplicationIdentifier');
  if (!admobAppId) {
    errors.push('Info.plist içinde GADApplicationIdentifier yok.');
  } else if (admobAppId.startsWith(sampleAdMobPublisher)) {
    errors.push('Info.plist içindeki GADApplicationIdentifier Google test app id kullanıyor.');
  }
  if (!infoPlist.includes('<key>SKAdNetworkItems</key>')) {
    warnings.push('Info.plist içinde SKAdNetworkItems yok; AdMob gelir ölçümü için eklenmeli.');
  }
  if (!infoPlist.includes('<key>NSUserTrackingUsageDescription</key>')) {
    warnings.push('Info.plist içinde NSUserTrackingUsageDescription yok; IDFA/kişiselleştirilmiş reklam istenecekse gerekli.');
  }
  if (!infoPlist.includes('<key>ITSAppUsesNonExemptEncryption</key>')) {
    warnings.push('Info.plist içinde ITSAppUsesNonExemptEncryption yok; yüklenen build için ihracat uyumluluğu sorusu tekrar sorulur.');
  }
}

const iosFirebasePath = 'ios/App/App/GoogleService-Info.plist';
const iosFirebase = read(iosFirebasePath);
if (!iosFirebase) {
  errors.push(`${iosFirebasePath} bulunamadı.`);
} else if (plistValue(iosFirebase, 'BUNDLE_ID') !== expectedAppId) {
  errors.push(`${iosFirebasePath} ${expectedAppId} bundle id'sine ait değil.`);
} else {
  if (plistValue(iosFirebase, 'PROJECT_ID') !== expectedFirebaseProjectId) {
    errors.push(`${iosFirebasePath} ${expectedFirebaseProjectId} projesine ait değil.`);
  }
  if (plistValue(iosFirebase, 'GCM_SENDER_ID') !== expectedFirebaseSenderId) {
    errors.push(`${iosFirebasePath} production sender id'sine ait değil.`);
  }
  if (plistValue(iosFirebase, 'GOOGLE_APP_ID') !== expectedFirebaseIosAppId) {
    errors.push(`${iosFirebasePath} App Store iOS Firebase uygulamasına ait değil.`);
  }
  const reversedClientId = plistValue(iosFirebase, 'REVERSED_CLIENT_ID');
  if (!reversedClientId || !infoPlist.includes(`<string>${reversedClientId}</string>`)) {
    errors.push('Google REVERSED_CLIENT_ID, Info.plist CFBundleURLSchemes içinde yok.');
  }
}

if (!fs.existsSync(fullPath('ios/App/App/PrivacyInfo.xcprivacy'))) {
  warnings.push('App hedefinde PrivacyInfo.xcprivacy yok; required-reason API kullanımı arşivden önce doğrulanmalı.');
}

if (errors.length) {
  console.error('App Store hazırlık kontrolü başarısız:');
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) {
    console.error('\nUyarılar:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exitCode = 1;
} else {
  console.log('App Store blocker kontrolü geçti.');
  if (warnings.length) {
    console.log('\nUyarılar:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}
