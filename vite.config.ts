import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The commit the bundle was built from, stamped into the app so a report from
 * a reader names the build it came from. A tarball with no git dir still
 * builds -- it just cannot say which commit it is.
 */
function buildId(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// GitHub Pages serves from /<repo>/ ; override with BASE=/ for a root domain.
const base = process.env.BASE ?? '/OneAyah/';

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify(buildId()) },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'licenses/*.txt'],
      manifest: {
        name: 'One Ayah — Qur’an Reader',
        short_name: 'One Ayah',
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
