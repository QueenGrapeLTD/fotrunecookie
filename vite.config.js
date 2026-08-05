import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        fortunes_admin: resolve(__dirname, 'fortunes_admin.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        delete_account: resolve(__dirname, 'delete-account.html')
      }
    }
  }
});
