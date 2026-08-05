import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');
const errors = [];

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=');
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    errors.push(`${path.basename(filePath)} geçerli JSON değil.`);
    return null;
  }
}

const env = readEnv(envPath);
const expectedFirebaseProject = 'fortunecookieai-prod';
const requiredClientKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

for (const key of requiredClientKeys) {
  if (!env[key]) errors.push(`${key} eksik.`);
}

if (env.VITE_FIREBASE_PROJECT_ID !== expectedFirebaseProject) {
  errors.push(`VITE_FIREBASE_PROJECT_ID ${expectedFirebaseProject} olmalıdır.`);
}

if (env.VITE_FIREBASE_AUTH_DOMAIN !== `${expectedFirebaseProject}.firebaseapp.com`) {
  errors.push(`VITE_FIREBASE_AUTH_DOMAIN ${expectedFirebaseProject}.firebaseapp.com olmalıdır.`);
}

const firebaseRc = readJson(path.join(projectRoot, '.firebaserc'));
if (firebaseRc?.projects?.default !== expectedFirebaseProject) {
  errors.push(`.firebaserc varsayılan projesi ${expectedFirebaseProject} olmalıdır.`);
}

const forbiddenFirebaseProject = 'atonumus-fortunecookie';
for (const relativePath of [
  'firebaseService.js',
  'firebase.json',
  '.firebaserc',
  'android/app/google-services.json',
  'ios/App/App/GoogleService-Info.plist',
]) {
  const fullPath = path.join(projectRoot, relativePath);
  if (
    fs.existsSync(fullPath) &&
    fs.readFileSync(fullPath, 'utf8').includes(forbiddenFirebaseProject)
  ) {
    errors.push(`${relativePath} eski Firebase projesine referans veriyor.`);
  }
}

if (/^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(env.VITE_FIREBASE_AUTH_DOMAIN || '')) {
  errors.push('VITE_FIREBASE_AUTH_DOMAIN localhost olamaz; Firebase yetkili alan adÄ± kullanÄ±lmalÄ±dÄ±r.');
}

if (env.VITE_ACCOUNT_STATE_CALLABLE_ENABLED === 'false') {
  errors.push('VITE_ACCOUNT_STATE_CALLABLE_ENABLED dağıtım için false olamaz.');
}

if (
  env.VITE_APP_CHECK_ENABLED === 'true' &&
  !env.VITE_RECAPTCHA_V3_SITE_KEY
) {
  errors.push('App Check etkinken VITE_RECAPTCHA_V3_SITE_KEY zorunludur.');
}

for (const requiredFile of [
  'firebase.json',
  'firestore.rules',
  'functions/index.js',
  'profileSchema.js',
]) {
  if (!fs.existsSync(path.join(projectRoot, requiredFile))) {
    errors.push(`${requiredFile} bulunamadı.`);
  }
}

if (errors.length) {
  console.error('Dağıtım öncesi kontrol başarısız:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Dağıtım öncesi istemci yapılandırması hazır.');
  console.log('Firebase secret kontrolü: GEMINI_API_KEY_SECRET ve REVENUECAT_SECRET_API_KEY.');
}
