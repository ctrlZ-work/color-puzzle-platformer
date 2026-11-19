import { defineConfig } from 'vite';

// base: './' makes the built game work from any folder on any static host,
// including a subfolder of the playadinfinitum.com portal.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000, // Phaser alone is ~1.4 MB
  },
});
