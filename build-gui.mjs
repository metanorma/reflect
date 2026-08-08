#!/usr/bin/env node
/**
 * Build script for the editor-gui static web app.
 *
 * Bundles `pkg/editor-gui/bootstrap.tsx` into `pkg/editor-gui/dist/` using esbuild, producing:
 *   - pkg/editor-gui/dist/bootstrap.js   (all JS, tree-shaken; minified unless --dev)
 *   - pkg/editor-gui/dist/bootstrap.css  (all CSS, extracted from JS)
 *   - pkg/editor-gui/dist/index.html     (loads the JS + CSS)
 *
 * Yarn PnP stores dependencies in zip archives that esbuild's native Go
 * resolver cannot read. The `pnp` plugin bridges this gap by resolving bare
 * specifiers through Node's PnP-aware `createRequire` and feeding the file
 * contents back to esbuild via `onLoad`.
 *
 * Usage:  yarn node build-gui.mjs [--dev]
 *
 * The optional `--dev` flag disables minification (and bundles React in
 * development mode) for easier debugging. In dev mode the generated
 * index.html also sets `data-use-react-strict="true"` on the <html> tag,
 * which bootstrap.tsx reads to enable <StrictMode>.
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dev = process.argv.includes('--dev') || process.argv.includes('dev');

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(projectRoot, 'pkg', 'editor-gui', 'bootstrap.tsx');
// Emit into the editor-gui workspace so the build output, static server, and
// e2e suite are all colocated under pkg/editor-gui/.
const outdir = path.join(projectRoot, 'pkg', 'editor-gui', 'dist');

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
    //
    // PnP's createRequire resolves to the CJS (.cjs) entry, but many packages
    // also ship granular ESM (.mjs) builds that enable tree-shaking. This is
    // critical for react-aria-components: its .cjs entry is pre-bundled
    // (~1.3 MB, no tree-shaking), while the .mjs entry lets esbuild drop unused
    // components (~100 KB for the 6 components used here). Redirect .cjs → .mjs
    // when a .mjs counterpart exists.
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      const resolveDir = args.resolveDir || projectRoot;
      const req = createRequire(resolveDir + '/');
      const resolved = req.resolve(args.path);
      let finalPath = resolved;
      if (resolved.endsWith('.cjs')) {
        const mjsCandidate = resolved.slice(0, -4) + '.mjs';
        try {
          statSync(mjsCandidate);
          finalPath = mjsCandidate;
        } catch {
          // No .mjs counterpart — keep the .cjs
        }
      }
      return { path: finalPath, namespace: 'pnp' };
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

// Ensure dist/ exists, then clear its contents without removing the
// directory itself (preserves any editor/IDE open handles on the folder).
await fs.mkdir(outdir, { recursive: true });
for (const entry of await fs.readdir(outdir)) {
  await fs.rm(path.join(outdir, entry), { recursive: true, force: true });
}

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

// In dev mode, add data-use-react-strict="true" so bootstrap.tsx wraps the
// app in <StrictMode>.
const htmlAttr = dev ? ' data-use-react-strict="true"' : '';

const html = `<!DOCTYPE html>
<html lang="en"${htmlAttr}>
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
console.log(`✓ editor-gui built → pkg/editor-gui/dist/${dev ? ' (dev)' : ''}`);
