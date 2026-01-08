/**
 * Build script for LogitLensWidget
 *
 * Bundles the TypeScript widget to JavaScript and outputs to:
 * - ndif/_web/public/logit-lens-widget.js (for web app)
 * - ndif/logitlens/static/logit-lens-widget.js (for Python package)
 */

import * as esbuild from 'esbuild';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src/lib/logit-lens-widget');
const webPublicDir = resolve(rootDir, 'public');
const pythonStaticDir = resolve(rootDir, '..', 'logitlens', 'static');

// Ensure output directories exist
[webPublicDir, pythonStaticDir].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

async function build() {
  const entryPoint = join(srcDir, 'index.ts');

  // Build configuration
  const buildOptions = {
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: 'LogitLensWidgetModule',
    minify: process.argv.includes('--minify'),
    sourcemap: process.argv.includes('--sourcemap'),
    target: ['es2020'],
    // Make LogitLensWidget available as a global function
    footer: {
      js: 'window.LogitLensWidget = LogitLensWidgetModule.LogitLensWidget;'
    }
  };

  try {
    // Build for web
    const webOutput = join(webPublicDir, 'logit-lens-widget.js');
    await esbuild.build({
      ...buildOptions,
      outfile: webOutput,
    });
    console.log(`✓ Built: ${webOutput}`);

    // Build minified version for web
    const webMinOutput = join(webPublicDir, 'logit-lens-widget.min.js');
    await esbuild.build({
      ...buildOptions,
      outfile: webMinOutput,
      minify: true,
    });
    console.log(`✓ Built: ${webMinOutput}`);

    // Build for Python package
    const pythonOutput = join(pythonStaticDir, 'logit-lens-widget.js');
    await esbuild.build({
      ...buildOptions,
      outfile: pythonOutput,
    });
    console.log(`✓ Built: ${pythonOutput}`);

    // Build minified version for Python package
    const pythonMinOutput = join(pythonStaticDir, 'logit-lens-widget.min.js');
    await esbuild.build({
      ...buildOptions,
      outfile: pythonMinOutput,
      minify: true,
    });
    console.log(`✓ Built: ${pythonMinOutput}`);

    console.log('\n✓ Widget build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
