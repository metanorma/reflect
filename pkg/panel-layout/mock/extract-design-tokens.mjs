#!/usr/bin/env node
/**
 * extract-design-tokens.mjs — lift the mock's design constants into a
 * generated JSON that the real implementation consumes.
 *
 * The mock (pkg/panel-layout/mock/editor-dockview7-floats.html) is the
 * SOURCE OF TRUTH; this script extracts, it does not define. Nothing here
 * should be edited by hand to change a value — change the mock and re-run:
 *
 *   node pkg/panel-layout/mock/extract-design-tokens.mjs
 *
 * Output: pkg/panel-layout/mock/design-tokens.json (pure JSON; the
 * provenance "comment" lives in its first key, _provenance).
 *
 * Why generated-JSON rather than a module both mock and implementation
 * import: the mock must stay a self-contained single file (it opens from
 * file:// and boots off pinned CDNs); making it fetch tokens.json would add
 * a runtime dependency and a second copy of the truth offline. When a real
 * package lands, it should import this JSON at build time — the mock stays
 * authoritative until then.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const MOCK = join(here, 'editor-dockview7-floats.html');
const OUT = join(here, 'design-tokens.json');

const src = readFileSync(MOCK, 'utf8');
const fail = (what) => { throw new Error(`extract failed: ${what}`); };

/* ---- provenance ---- */
const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', MOCK],
  { cwd: join(here, '..', '..') }).toString().trim() || '(uncommitted)';
const shaDate = execFileSync('git', ['log', '-1', '--format=%cI', '--', MOCK],
  { cwd: join(here, '..', '..') }).toString().trim();
let dirty = false;
try {
  dirty = execFileSync('git', ['status', '--porcelain', '--', MOCK],
    { cwd: join(here, '..', '..') }).toString().trim().length > 0;
} catch { /* git absent — leave dirty=false */ }

/* ---- CSS custom properties ---- */
// The mock's own token layer: the :root block.
const rootBlock = src.match(/  :root\{([\s\S]*?)\n  \}/)?.[1] ?? fail(':root block');
const parseDecls = (block) => Object.fromEntries(
  block.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--')).map((d) => {
    const i = d.indexOf(':');
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
  })
);
const tokens = parseDecls(rootBlock);

// The dockview theme override layer: .layoutArea .dockview-theme-light { ... }
const dvBlock = src.match(/  \.layoutArea \.dockview-theme-light\{([\s\S]*?)\n  \}/)?.[1]
  ?? fail('dockview theme override block');
const dvTokens = parseDecls(dvBlock);

/* ---- JS constants (verbatim snippets evaluated in a bare VM) ---- */
const num = (re, name) => {
  const m = src.match(re) ?? fail(name);
  return Number(m[1]);
};
const str = (re, name) => {
  const m = src.match(re) ?? fail(name);
  return m[1];
};
const LS_KEY = str(/const LS_KEY = '([^']+)'/, 'LS_KEY');
const LS_H_KEY = str(/const LS_H_KEY = '([^']+)'/, 'LS_H_KEY');

const constants = {
  MIN_TS_H: num(/const MIN_TS_H = (\d+)/, 'MIN_TS_H'),
  MIN_WIN_H: num(/const MIN_WIN_H = (\d+)/, 'MIN_WIN_H'),
  windowMinWidth: num(/isCorner\) bounds\.width = Math\.max\((\d+)/, 'window min width'),
  undockChrome: num(/const chrome = (\d+)/, 'undock chrome'),
  sashSize: num(/Math\.max\(0, n - 1\) \* (\d+); \/\/ \d+px per sash/, 'sash size'),
  // WRAP_W/WRAP_H are declared together (`const WRAP_W = 260, WRAP_H = 200;`)
  // so they are matched without the `const` anchor.
  WRAP_W: num(/WRAP_W = (\d+)/, 'WRAP_W'),
  WRAP_H: num(/WRAP_H = (\d+)/, 'WRAP_H'),
};

const objLiteral = (name, from) => {
  // balanced-brace slice starting at `from` (which must include the '{'),
  // then trim a trailing comma if present.
  const start = src.indexOf(from);
  if (start < 0) fail(name);
  const b0 = src.indexOf('{', start);
  let depth = 0, i = b0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (i >= src.length) fail(name + ' (unbalanced braces)');
  const snippet = src.slice(b0, i + 1);
  return vm.runInNewContext(`(${snippet})`, {}, { timeout: 1000 }) ?? fail(name);
};

const dndEdges = objLiteral('dndEdges', 'dndEdges: {');
const floatingGroupBounds = objLiteral('floatingGroupBounds', 'floatingGroupBounds: {');

/* ---- panel titles + preset layout (verbatim, brace-matched, VM-evaluated) ---- */
const sliceBalanced = (from, opener) => {
  const start = src.indexOf(from);
  if (start < 0) fail(from.slice(0, 40));
  const open = src.indexOf(opener, start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === opener[0] && src.startsWith(opener, i) && depth === 0
      && src.slice(start, i).includes(opener)) break;
  }
  // simpler: manual scan from the first '{' after `from`
  const b0 = src.indexOf('{', start);
  depth = 0;
  for (i = b0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
};

const titlesSnippet = sliceBalanced('const TITLES =', '{')
  .replace(/^const TITLES =/, 'const TITLES ='); // verbatim
const presetSnippet = sliceBalanced('function presetLayout()', '{');

const prelude = `
    const G = (id, views, activeView) => ({ id, views, activeView });
    const leaf = (data, size) => ({ type: 'leaf', data, size });
    const branch = (data, size) => ({ type: 'branch', data, size });
    ${titlesSnippet}
    ${presetSnippet}
    ({ titles: TITLES, presetLayout: presetLayout() });
  `;
const { titles, presetLayout } = vm.runInNewContext(prelude, {}, { timeout: 1000 })
  ?? fail('titles/presetLayout VM evaluation');

/* ---- pinned CDN deps (importmap) ---- */
const importMap = JSON.parse(
  src.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/)?.[1] ?? fail('importmap'));

const out = {
  _provenance: {
    source: 'pkg/panel-layout/mock/editor-dockview7-floats.html',
    commit: sha,
    commitDate: shaDate || null,
    workingTreeDirtyAtExtraction: dirty,
    extractedAtUTC: new Date().toISOString(),
    regenerate: 'node pkg/panel-layout/mock/extract-design-tokens.mjs',
    note: 'GENERATED FILE — do not edit by hand; the mock is the source of truth. '
      + 'Change the mock, re-run the command above.',
  },
  tokens,          // mock :root custom properties (verbatim)
  dvTokens,        // dockview theme overrides .layoutArea .dockview-theme-light (verbatim)
  constants,       // layout behavior constants (px floors, chrome, sash, fallbacks)
  dndEdges,        // dockview dndEdges option (verbatim)
  floatingGroupBounds, // dockview floatingGroupBounds option (verbatim)
  storageKeys: { layout: LS_KEY, heights: LS_H_KEY },
  panelTitles: titles,   // panel id -> tab title (verbatim)
  presetLayout,          // dockview v7 serialized preset (verbatim shape)
  importMap,             // pinned CDN dependency URLs (verbatim)
};

const jsonText = JSON.stringify(out, null, 2) + '\n';
const CHECK = process.argv.includes('--check');

if (CHECK) {
  let ok = true;
  try {
    const current = readFileSync(OUT, 'utf8');
    // extractedAtUTC is per-run; compare the rest.
    const strip = (s) => s.replace(/"extractedAtUTC":[^,]+/, '');
    if (strip(current) !== strip(jsonText)) {
      console.error('design-tokens.json is stale — regenerate with '
        + 'yarn workspace @metanorma/panel-layout tokens:extract');
      ok = false;
    } else {
      console.log('design-tokens.json up to date');
    }
  } catch {
    console.error('design-tokens.json missing — run tokens:extract');
    ok = false;
  }
  if (!ok) {
    process.exit(1);
  }
} else {
  writeFileSync(OUT, jsonText);
  console.log(`wrote ${OUT}`);
  console.log(`  tokens=${Object.keys(tokens).length} dvTokens=${Object.keys(dvTokens).length} `
    + `constants=${Object.keys(constants).length} panels=${Object.keys(titles).length} `
    + `floats=${presetLayout.floatingGroups.length} @ ${sha.slice(0, 8)}${dirty ? ' (dirty)' : ''}`);
}
