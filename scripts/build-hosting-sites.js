import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicOut = resolve(root, 'dist-public');
const adminOut = resolve(root, 'dist-admin');
const viteBin = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js');

rmSync(publicOut, { recursive: true, force: true });
rmSync(adminOut, { recursive: true, force: true });
mkdirSync(publicOut, { recursive: true });

copyFileSync(resolve(root, 'mobile-only.html'), resolve(publicOut, 'index.html'));
copyFileSync(resolve(root, 'privacy.html'), resolve(publicOut, 'privacy.html'));
copyFileSync(resolve(root, 'delete-account.html'), resolve(publicOut, 'delete-account.html'));
copyFileSync(resolve(root, 'legal.css'), resolve(publicOut, 'legal.css'));
copyFileSync(resolve(root, 'hosting.css'), resolve(publicOut, 'hosting.css'));
copyFileSync(resolve(root, 'public', 'app-ads.txt'), resolve(publicOut, 'app-ads.txt'));
copyFileSync(resolve(root, 'public', 'favicon-32.png'), resolve(publicOut, 'favicon-32.png'));
copyFileSync(resolve(root, 'public', 'apple-touch-icon.png'), resolve(publicOut, 'apple-touch-icon.png'));
mkdirSync(resolve(publicOut, 'brand'), { recursive: true });
copyFileSync(
  resolve(root, 'public', 'brand', 'fortune-cookie-ai-logo.png'),
  resolve(publicOut, 'brand', 'fortune-cookie-ai-logo.png'),
);
writeFileSync(resolve(publicOut, 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf8');

execFileSync(process.execPath, [viteBin, 'build', '--config', 'vite.admin.config.js'], {
  cwd: root,
  stdio: 'inherit',
});
copyFileSync(resolve(root, 'public', 'favicon-32.png'), resolve(adminOut, 'favicon-32.png'));
copyFileSync(resolve(root, 'public', 'apple-touch-icon.png'), resolve(adminOut, 'apple-touch-icon.png'));
writeFileSync(resolve(adminOut, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

console.log('Public mobile landing and isolated admin hosting bundles are ready.');
