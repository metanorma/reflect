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
 * Dependency resolution needs no plugin. esbuild implements Yarn
 * Plug'n'Play natively — v0.15.0 (2022-08-10): the PnP resolution
 * algorithm, reading inputs directly from the .yarn/cache zip archives,
 * respecting `module`/`browser` fields inside them; v0.15.4 (#2473):
 * exports maps honored, i.e. full condition-based entry selection. That
 * condition selection is also why no .cjs→.mjs redirect is needed —
 * esbuild applies the `import`/`module` conditions itself and picks ESM
 * entries (e.g. react-aria-components' dist/exports/index.mjs) that a
 * createRequire-based resolver (which sees the `require` condition's
 * .cjs) used to miss. Yarn's own @yarnpkg/esbuild-plugin-pnp is
 * deprecated for exactly this reason ("Starting from Esbuild 0.15, this
 * plugin isn't needed anymore"); Storybook removed its copy in Nov 2025
 * (PR #33097). The one requirement is that esbuild find `.pnp.cjs` in
 * the working directory's tree — satisfied by running via `yarn node`
 * from the repo root (esbuild docs, Getting Started, "Using Yarn
 * Plug'n'Play").
 *
 * Usage:  yarn node build-minimap-demo.mjs [--dev]
 */
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dev = process.argv.includes('--dev') || process.argv.includes('dev');

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(projectRoot, 'pkg', 'prosemirror-minimap', 'harness', 'bootstrap.tsx');
// Emit inside the package so the build output, static server, and e2e suite
// are all colocated under pkg/prosemirror-minimap/.
const outdir = path.join(projectRoot, 'pkg', 'prosemirror-minimap', 'harness', 'dist');

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
  // CSS loaders for all inputs by extension — including files esbuild
  // resolves natively out of the PnP zip archives.
  loader: { '.module.css': 'local-css', '.css': 'global-css' },
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
