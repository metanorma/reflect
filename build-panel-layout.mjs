#!/usr/bin/env node
/**
 * Build script for @metanorma/panel-layout (build groundwork: two proof
 * targets, one script).
 *
 *   dist/mock/panel-layout.js  — MOCK-FACING: entry `internal.ts` (the
 *     dev-only internal surface), every peer EXTERNAL (wildcard patterns:
 *     react, react-dom, dockview-react + `/*` subpaths — `jsx: automatic`
 *     emits `react/jsx-runtime` once .tsx sources land, and a bare-name
 *     external would let esbuild bundle the peer into the artifact). The
 *     consumer supplies the engine: the parity mock's esm.sh importmap.
 *     Servable at http://127.0.0.1:4173/dist/mock/panel-layout.js by
 *     tests/parity/serve.mjs — the future mock glue imports it there
 *     (mock rewiring is deliberately deferred to the component change).
 *
 *   dist/twin/panel-layout.js  — TWIN-FACING: entry `index.ts` (the
 *     public surface), NOTHING external — the engine is bundled from the
 *     yarn-installed exact 7.0.4 pins, proving version truth with what
 *     the product will get. Not a ship artifact: the ship format stays
 *     source/peer per the package exports map. Duplicate-instance
 *     protection is yarn's own gate (`yarn check-for-multiple-instances`).
 *
 * Post-build asserts (fresh builds only; skipped in --watch): the
 * mock-facing metafile's external set must be a SUBSET of the allowed
 * packages with an EMPTY intersection with dockview/dockview-core — the
 * artifact-level mirror of scripts/check-imports.mjs (a runtime engine
 * import in the graph would resolve to a second dockview-core instance
 * next to the one inlined in the mock's bundled dockview-react; see that
 * script's header). The twin-facing output must be non-empty, and once
 * `index.ts` grows exports, at least one named export.
 *
 * A structural clone of build-minimap-demo.mjs (itself a clone of
 * build-gui.mjs — same Yarn PnP resolver bridge, `.cjs → .mjs` redirect,
 * and CSS loaders); keep the three in sync. NO index.html is generated
 * here: the mock page is hand-authored, and the twin harness page arrives
 * with the PanelLayout component. A panel-layout.css appears next to each
 * entry only when an import chain reaches CSS — none today.
 *
 * Usage:  yarn node build-panel-layout.mjs [--dev] [--watch]
 */
import { context } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dev = process.argv.includes('--dev') || process.argv.includes('dev');
const watch = process.argv.includes('--watch');

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(projectRoot, 'pkg', 'panel-layout');

// Runtime imports allowed in the mock-facing artifact. Wildcards matter:
// `jsx: 'automatic'` emits `react/jsx-runtime`; a bare-name external list
// would not match it once .tsx sources exist.
const MOCK_ALLOWED = new Set(['react', 'react-dom', 'dockview-react']);
const MOCK_BANNED = new Set(['dockview', 'dockview-core']);

const TARGETS = [
  {
    name: 'mock',
    entry: path.join(pkgRoot, 'internal.ts'),
    outdir: path.join(pkgRoot, 'dist', 'mock'),
    externals: [
      'react', 'react/*',
      'react-dom', 'react-dom/*',
      'dockview-react', 'dockview-react/*',
    ],
  },
  {
    name: 'twin',
    entry: path.join(pkgRoot, 'index.ts'),
    outdir: path.join(pkgRoot, 'dist', 'twin'),
    externals: null,
  },
];

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
    // Resolve bare specifiers (e.g. "react", "dockview-react") through
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

function optionsFor(target) {
  return {
    entryPoints: [target.entry],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    platform: 'browser',
    target: 'es2020',
    outdir: target.outdir,
    entryNames: 'panel-layout',
    sourcemap: true,
    minify: !dev,
    metafile: true,
    // React (and other libs) select prod vs. dev via process.env.NODE_ENV;
    // the mock's CDN build is production-shaped, and dev React warnings
    // would pollute the future pixel-parity layer.
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
    },
    // CSS loaders for files resolved natively (project-local stylesheets).
    loader: { '.module.css': 'local-css', '.css': 'global-css' },
    plugins: [pnpPlugin],
    logLevel: 'info',
    ...(target.externals ? { external: target.externals } : {}),
  };
}

// Ensure the target dir exists, then clear its contents without removing
// the directory itself (preserves any editor/IDE open handles). Only the
// per-target subdir is cleared — dist/ itself keeps its README.rst.
async function clean(outdir) {
  await fs.mkdir(outdir, { recursive: true });
  for (const entry of await fs.readdir(outdir)) {
    await fs.rm(path.join(outdir, entry), { recursive: true, force: true });
  }
}

function fail(message) {
  console.error(`build-panel-layout: ${message}`);
  process.exit(1);
}

/** Mock-facing: banned engine packages appear NOWHERE in the module
 *  graph, and the external set is a subset of the allow-list. A runtime
 *  dockview/dockview-core import is NOT externalized (they are not on the
 *  external list) — esbuild bundles it, and it surfaces as a graph INPUT
 *  from the package's PnP zip; scanning only external imports would miss
 *  it. The external checks guard the complementary leak: something marked
 *  external (engine or otherwise) that the mock's importmap can't supply. */
function assertMockExternals(metafile) {
  const bannedPath = /node_modules[/\\](dockview|dockview-core)[/\\]/;
  const bundled = Object.keys(metafile.inputs)
    .filter((p) => bannedPath.test(p));
  if (bundled.length > 0) {
    fail('mock-facing bundle has RUNTIME engine imports (must be '
      + 'type-only): dockview/dockview-core found in the module graph '
      + `(${bundled.length} input file(s)) — a second dockview-core `
      + 'instance would load next to the mock\'s bundled dockview-react '
      + '(see scripts/check-imports.mjs)');
  }
  const bannedHits = new Set();
  const notAllowed = new Set();
  for (const out of Object.values(metafile.outputs)) {
    for (const imp of out.imports) {
      if (!imp.external) continue;
      const base = imp.path.split('/')[0];
      if (MOCK_BANNED.has(base)) bannedHits.add(imp.path);
      else if (!MOCK_ALLOWED.has(base)) notAllowed.add(imp.path);
    }
  }
  if (bannedHits.size > 0) {
    fail('mock-facing bundle externalizes a banned engine package: '
      + [...bannedHits].join(', '));
  }
  if (notAllowed.size > 0) {
    fail('mock-facing bundle has externals outside the peer allow-list: '
      + [...notAllowed].join(', '));
  }
}

/** Twin-facing: non-empty output; named exports once any exist. */
function assertTwin(metafile, target) {
  for (const [key, out] of Object.entries(metafile.outputs)) {
    if (out.entryPoint === undefined) continue; // maps, css chunks
    const file = path.resolve(key);
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      fail(`${target.name}: missing output ${key}`);
    }
    if (size === 0) {
      fail(`${target.name}: ${key} is 0 bytes — index.ts has no value `
        + 'exports yet — placeholder bundle');
    }
    const named = (out.exports ?? []).filter(([name]) => name !== 'default');
    if ((out.exports ?? []).length > 0 && named.length === 0) {
      fail(`${target.name}: ${key} exports carry no named export — the `
        + 'public surface is specified as named symbols');
    }
  }
}

async function buildFresh(target) {
  await clean(target.outdir);
  const ctx = await context(optionsFor(target));
  const result = await ctx.rebuild();
  await ctx.dispose();
  if (target.name === 'mock') {
    assertMockExternals(result.metafile);
  } else {
    assertTwin(result.metafile, target);
  }
  console.log(`✓ panel-layout ${target.name} built → `
    + path.relative(projectRoot, target.outdir) + `${dev ? ' (dev)' : ''}`);
}

async function buildWatching(target) {
  const ctx = await context(optionsFor(target));
  await ctx.watch(); // includes the initial build; asserts skipped (see
  console.log(`↻ panel-layout ${target.name} watching`); // header)
}

if (watch) {
  for (const target of TARGETS) await buildWatching(target);
} else {
  for (const target of TARGETS) await buildFresh(target);
}
