import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Keep only the woff2 source on the Phosphor @font-face. The package ships woff2, woff, ttf
 * and svg; WebView2 reads woff2, and the svg fallback alone is three megabytes against a
 * 20 MB installer budget. Vite emits every file a url() names, so the url() has to go.
 */
function phosphorWoff2Only(): Plugin {
  const unwanted = /^assets\/Phosphor-[^/]+\.(ttf|woff|svg)$/;

  return {
    name: 'ideascape:phosphor-woff2-only',
    generateBundle(_options, bundle) {
      const dropped: string[] = [];
      for (const fileName of Object.keys(bundle)) {
        if (unwanted.test(fileName)) {
          dropped.push(fileName);
          delete bundle[fileName];
        }
      }
      if (dropped.length === 0) return;

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'asset' || !chunk.fileName.endsWith('.css')) continue;
        let css = String(chunk.source);
        for (const fileName of dropped) {
          const base = fileName.slice('assets/'.length);
          css = css.replace(
            new RegExp(`,?\\s*url\\([^)]*${base}[^)]*\\)\\s*format\\([^)]*\\)`, 'g'),
            '',
          );
        }
        chunk.source = css.replace(/,\s*;/g, ';');
      }
    },
  };
}

// Vite must stay on port 1420 — src-tauri/tauri.conf.json points the shell at it.
export default defineConfig({
  plugins: [svelte(), phosphorWoff2Only()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'esnext',
    // Fonts must emit as real files so the vendored-asset check can find the .woff2 files.
    assetsInlineLimit: 0,
  },
});
