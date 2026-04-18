import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to './' for GitHub Pages compatibility in both subpaths and root
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
