#!/usr/bin/env node
/**
 * Build script for the prosemirror-minimap test harness page (§15.3).
 *
 * Bundles `pkg/prosemirror-minimap/harness/bootstrap.tsx` into
 * `pkg/prosemirror-minimap/harness/dist/` using esbuild:
 *   - harness/dist/bootstrap.js   (all JS, tree-shaken; minified unless --dev)
 *   - harness/dist/bootstrap.css  (all CSS, extracted from JS)
 *   - harness/dist/index.html     (loads the JS + CSS)
 *
 * A structural clone of `build-gui.mjs` (same Yarn PnP resolver bridge,
 * `.cjs → .mjs` redirect, and CSS loaders) — the GUI build is the proven
 * pattern for esbuild-in-PnP in this repo; keep the two in sync.
 *
 * Usage:  yarn node build-minimap-demo.mjs [--dev]
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dev = process.argv.includes('--dev') || process.argv.includes('dev');

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(projectRoot, 'pkg', 'prosemirror-minimap', 'harness', 'bootstrap.tsx');
// Emit inside the package so the build output, static server, and e2e suite
// are all colocated under pkg/prosemirror-minimap/.
const outdir = path.join(projectRoot, 'pkg', 'prosemirror-minimap', 'harness', 'dist');

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
    // Resolve bare specifiers (e.g. "react", "prosemirror-view") through
    // PnP using createRequire seeded with the importer's resolveDir. PnP's
    // createRequire resolves to the CJS (.cjs) entry; redirect to a .mjs
    // counterpart when one exists (granular ESM → tree-shaking). See
    // build-gui.mjs for the full rationale.
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
  <title>Minimap harness</title>
  <link rel="stylesheet" href="./bootstrap.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./bootstrap.js"></script>
</body>
</html>
`;

await fs.writeFile(path.join(outdir, 'index.html'), html);
console.log(`✓ minimap harness built → pkg/prosemirror-minimap/harness/dist/${dev ? ' (dev)' : ''}`);
