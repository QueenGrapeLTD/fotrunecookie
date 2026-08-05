import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const expectedAppId = 'com.fortunecookieai.app';
const expectedFirebaseProject = 'fortunecookieai-prod';
const root = process.cwd();
const errors = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`${relativePath} bulunamadı.`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function expectContains(relativePath, expected, label) {
  const contents = read(relativePath);
  if (contents && !contents.includes(expected)) {
    errors.push(`${label}: ${relativePath} içinde "${expected}" bulunamadı.`);
  }
}

expectContains('capacitor.config.json', `"appId": "${expectedAppId}"`, 'Capacitor App ID uyuşmuyor');
expectContains('android/app/build.gradle', `applicationId "${expectedAppId}"`, 'Android applicationId uyuşmuyor');
expectContains(
  'android/app/src/main/java/com/fortunecookieai/app/MainActivity.java',
  `package ${expectedAppId};`,
  'Android Java paketi uyuşmuyor',
);
expectContains('ios/App/App.xcodeproj/project.pbxproj', `PRODUCT_BUNDLE_IDENTIFIER = ${expectedAppId};`, 'iOS Bundle ID uyuşmuyor');

const androidFirebasePath = 'android/app/google-services.json';
const androidFirebase = read(androidFirebasePath);
if (androidFirebase) {
  try {
    const parsed = JSON.parse(androidFirebase);
    const packageNames = (parsed.client || [])
      .map(client => client?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!packageNames.includes(expectedAppId)) {
      errors.push(
        `${androidFirebasePath} eski pakete ait (${packageNames.join(', ') || 'paket bulunamadı'}). ` +
        `Firebase Console'da ${expectedAppId} Android uygulamasını ekleyip dosyayı yeniden indirin.`,
      );
    }
    if (parsed.project_info?.project_id !== expectedFirebaseProject) {
      errors.push(
        `${androidFirebasePath} ${expectedFirebaseProject} projesine ait değil.`,
      );
    }
  } catch {
    errors.push(`${androidFirebasePath} geçerli JSON değil.`);
  }
}

const iosFirebaseCandidates = [
  'ios/App/App/GoogleService-Info.plist',
  'ios/App/GoogleService-Info.plist',
];
const iosFirebasePath = iosFirebaseCandidates.find((candidate) =>
  fs.existsSync(path.join(root, candidate)));
if (!iosFirebasePath) {
  errors.push('iOS GoogleService-Info.plist bulunamadı.');
} else {
  const iosFirebase = read(iosFirebasePath);
  if (
    iosFirebase &&
    !new RegExp(`<key>BUNDLE_ID</key>\\s*<string>${expectedAppId.replaceAll('.', '\\.')}</string>`)
      .test(iosFirebase)
  ) {
    errors.push(
      `${iosFirebasePath} eski Bundle ID'ye ait. Firebase Console'da ${expectedAppId} iOS ` +
      'uygulamasını ekleyip GoogleService-Info.plist dosyasını yeniden indirin.',
    );
  }
  if (
    iosFirebase &&
    !new RegExp(`<key>PROJECT_ID</key>\\s*<string>${expectedFirebaseProject}</string>`)
      .test(iosFirebase)
  ) {
    errors.push(`${iosFirebasePath} ${expectedFirebaseProject} projesine ait değil.`);
  }
}

if (errors.length) {
  console.error('Mobil yapılandırma kontrolü başarısız:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Mobil kimlikler ve Firebase dosyaları hazır: ${expectedAppId}`);
}
