import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves from /<repo>/ ; override with BASE=/ for a root domain.
const base = process.env.BASE ?? '/qRead/';

export default defineConfig({
  base,
  build: { target: 'es2022', assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'licenses/*.txt'],
      manifest: {
        name: 'qRead — Qur’an Reader',
        short_name: 'qRead',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2a6fd6',
      },
      workbox: {
        // Data files are content-addressed by the precache manifest revision,
        // so a changed ayah file invalidates only itself.
        globPatterns: ['**/*.{js,css,html,woff2,json,txt}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
