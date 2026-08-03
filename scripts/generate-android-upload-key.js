import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const alias = 'fortunecookieai-upload';
const javaHome = process.env.JAVA_HOME ||
  'C:\\Program Files\\Android\\Android Studio\\jbr';
const keytool = path.join(javaHome, 'bin', 'keytool.exe');
const projectPropertiesPath = path.join(process.cwd(), 'android', 'keystore.properties');
const backupDirectory = path.join(os.homedir(), 'Documents', 'FortuneCookieAI-Signing');
const keystorePath = path.join(backupDirectory, 'fortunecookieai-upload.jks');
const recoveryPath = path.join(backupDirectory, 'UPLOAD-KEY-RECOVERY.txt');

for (const requiredPath of [keytool]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`Gerekli araç bulunamadı: ${requiredPath}`);
  }
}

if (fs.existsSync(keystorePath) || fs.existsSync(projectPropertiesPath)) {
  throw new Error(
    'Mevcut imzalama anahtarı bulundu. Güvenlik için otomatik olarak üzerine yazılmadı.',
  );
}

fs.mkdirSync(backupDirectory, { recursive: true });
const password = randomBytes(32).toString('base64url');

execFileSync(keytool, [
  '-genkeypair',
  '-v',
  '-keystore', keystorePath,
  '-storetype', 'PKCS12',
  '-storepass', password,
  '-keypass', password,
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '4096',
  '-validity', '10000',
  '-dname', 'CN=Fortune Cookie AI Upload, O=Fortune Cookie AI, C=TR',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const certificateDetails = execFileSync(keytool, [
  '-list',
  '-v',
  '-keystore', keystorePath,
  '-storepass', password,
  '-alias', alias,
], { encoding: 'utf8' });

const fingerprints = certificateDetails
  .split(/\r?\n/)
  .filter(line => /\bSHA1:|\bSHA256:/.test(line))
  .map(line => line.trim())
  .join('\n');

const normalizedKeystorePath = keystorePath.replaceAll('\\', '/');
fs.writeFileSync(
  projectPropertiesPath,
  [
    `storeFile=${normalizedKeystorePath}`,
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    '',
  ].join('\n'),
  { encoding: 'utf8', flag: 'wx' },
);

fs.writeFileSync(
  recoveryPath,
  [
    'FORTUNE COOKIE AI - ANDROID UPLOAD KEY',
    '',
    `Keystore: ${keystorePath}`,
    `Alias: ${alias}`,
    `Password: ${password}`,
    '',
    fingerprints,
    '',
    'Bu klasörü şifreli ve çevrimdışı bir konuma yedekleyin.',
    'Bu bilgileri kaynak kod deposuna veya mesajlaşma uygulamalarına yüklemeyin.',
    '',
  ].join('\n'),
  { encoding: 'utf8', flag: 'wx' },
);

console.log(`Android upload key oluşturuldu: ${keystorePath}`);
console.log(`Kurtarma bilgisi oluşturuldu: ${recoveryPath}`);
console.log(fingerprints);
