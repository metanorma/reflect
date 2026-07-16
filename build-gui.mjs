#!/usr/bin/env node
/**
 * Build script for the editor-gui static web app.
 *
 * Bundles `pkg/editor-gui/bootstrap.tsx` into `dist/` using esbuild, producing:
 *   - dist/bootstrap.js   (all JS, tree-shaken; minified unless --dev)
 *   - dist/bootstrap.css  (all CSS, extracted from JS)
 *   - dist/index.html     (loads the JS + CSS)
 *
 * Yarn PnP stores dependencies in zip archives that esbuild's native Go
 * resolver cannot read. The `pnp` plugin bridges this gap by resolving bare
 * specifiers through Node's PnP-aware `createRequire` and feeding the file
 * contents back to esbuild via `onLoad`.
 *
 * Usage:  yarn node build-gui.mjs [--dev]
 *
 * The optional `--dev` flag disables minification (and bundles React in
 * development mode) for easier debugging.
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dev = process.argv.includes('--dev') || process.argv.includes('dev');

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(projectRoot, 'pkg', 'editor-gui', 'bootstrap.tsx');
const outdir = path.join(projectRoot, 'dist');

// ── esbuild loader per file extension (for PnP-loaded files) ───────────

const EXT_TO_LOADER = {
  '.ts':   'ts',
  '.tsx':  'tsx',
  '.js':   'js',
  '.jsx':  'jsx',
  '.mjs':  'js',
  '.cjs':  'js',
  '.json': 'json',
};

function cssLoaderFor(filePath) {
  if (filePath.endsWith('.module.css')) return 'local-css';
  if (filePath.endsWith('.css'))        return 'global-css';
  return undefined;
}

// ── Yarn PnP resolution plugin ─────────────────────────────────────────

const pnpPlugin = {
  name: 'pnp',
  setup(b) {
    // Resolve bare specifiers (e.g. "react", "@metanorma/prosemirror-editor")
    // through PnP using createRequire seeded with the importer's resolveDir.
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      const resolveDir = args.resolveDir || projectRoot;
      const req = createRequire(resolveDir + '/');
      return { path: req.resolve(args.path), namespace: 'pnp' };
    });

    // Load resolved files from the PnP virtual filesystem (zip archives)
    // using Node's PnP-patched fs, which esbuild's native Go fs cannot read.
    b.onLoad({ filter: /.*/, namespace: 'pnp' }, async (args) => {
      const ext = path.extname(args.path);
      const cssLoader = cssLoaderFor(args.path);
      const loader = cssLoader ?? EXT_TO_LOADER[ext] ?? 'default';
      const contents = await fs.readFile(args.path, 'utf8');
      return { contents, resolveDir: path.dirname(args.path), loader };
    });
  },
};

// ── Build ──────────────────────────────────────────────────────────────

// Clean previous output
await fs.rm(outdir, { recursive: true, force: true });
await fs.mkdir(outdir, { recursive: true });

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  platform: 'browser',
  target: 'es2020',
  outdir,
  sourcemap: true,
  minify: !dev,
  // React (and other libs) select prod vs. dev via process.env.NODE_ENV.
  // Use "development" in dev mode so React dev-time warnings are included.
  define: {
    'process.env.NODE_ENV': dev ? '"development"' : '"production"',
  },
  // CSS loaders for files resolved natively (project-local stylesheets).
  loader: { '.module.css': 'local-css', '.css': 'global-css' },
  plugins: [pnpPlugin],
  logLevel: 'info',
});

// ── Generate index.html ────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Metanorma Editor</title>
  <link rel="stylesheet" href="./bootstrap.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./bootstrap.js"></script>
</body>
</html>
`;

await fs.writeFile(path.join(outdir, 'index.html'), html);
console.log(`✓ editor-gui built → dist/${dev ? ' (dev)' : ''}`);
