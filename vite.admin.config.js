import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'admin.html'),
        fortunes_admin: resolve(__dirname, 'fortunes_admin.html'),
      },
    },
  },
});
