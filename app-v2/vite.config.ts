import { defineConfig, type PluginOption } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
import { appendFileSync, writeFileSync } from 'node:fs';

// Dev-only: receive perf metrics POSTed by the tablet (<PerfHud>) and append them
// to perf.log on this computer so they can be inspected. TEMPORARY (diagnostics).
function perfLogger(): PluginOption {
  const logPath = resolve(__dirname, 'perf.log');
  return {
    name: 'perf-logger',
    apply: 'serve',
    configureServer(server) {
      try {
        writeFileSync(logPath, `# perf log started ${new Date().toISOString()}\n`);
      } catch {
        /* ignore */
      }
      server.middlewares.use('/__perf', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            appendFileSync(logPath, `${new Date().toISOString()} ${body}\n`);
          } catch {
            /* ignore */
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    perfLogger(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'tfjs/**/*', 'assets/*'],
      manifest: {
        name: 'OnePen — Smart Note Taking',
        short_name: 'OnePen',
        description: 'AI-powered handwriting note-taking app with gesture recognition',
        theme_color: '#1f1d1c',
        background_color: '#fdfaf4',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        categories: ['productivity', 'education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,bin,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /^\/predict/],
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        collect: resolve(__dirname, 'collectData.html'),
      },
    },
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
      $config: resolve(__dirname, 'src/config'),
      $types: resolve(__dirname, 'src/types'),
      $stores: resolve(__dirname, 'src/stores'),
      $canvas: resolve(__dirname, 'src/canvas'),
      $input: resolve(__dirname, 'src/input'),
      $tools: resolve(__dirname, 'src/tools'),
      $modifiers: resolve(__dirname, 'src/modifiers'),
      $persistence: resolve(__dirname, 'src/persistence'),
      $auth: resolve(__dirname, 'src/auth'),
      $ml: resolve(__dirname, 'src/ml'),
      $components: resolve(__dirname, 'src/components'),
    },
  },
  server: {
    host: true, // expose on the LAN so the tablet can reach it by IP
    port: 5173,
    strictPort: false,
    open: false,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
