import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const sourcePath = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  base: process.env.VITE_PUBLIC_BASE || '/',
  resolve: {
    alias: {
      '#bgm': sourcePath('./src/bgm.js'),
      '#codex-pet-preview': sourcePath('./src/codexPetPreview.js'),
      '#glb-export': sourcePath('./src/glbExport.browser.js'),
      '#platform': sourcePath('./src/platform.browser.js'),
    },
  },
});
