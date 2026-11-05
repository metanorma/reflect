#!/usr/bin/env node

// Tests for scripts/check-pins.mjs.
//
// Covers the pure surface (parsePins, parseArgv) plus the two offline CLI
// behaviors that CI and the drift workflow rely on: lint's bidirectional
// pin-table↔sensitivity-map consistency, drift's config-class failure
// before any network call, and gate's exit-code relay (1 on drift-fail,
// 2 on per-repo error or missing/corrupt status file — the relay that
// makes an all-error run end red rather than silently green).
//
// Zero runtime dependencies — node:test + node:assert/strict. No network:
// the drift tests exercise only the paths that exit before fetching.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePins, parseArgv, diffTrees, classifyHint } from './check-pins.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'check-pins.mjs');
const ledgerPath = join(here, '..', 'docs', 'metanorma-model.md');

// All seven repos the sensitivity map watches — scratch tables must carry
// exactly these for the bidirectional consistency check to pass.
const PINS = [
  '| metanorma/metanorma-standoc | `ba325b0e` | converter |',
  '| metanorma/standoc-models | `7d5d737c` | grammar sources |',
  '| metanorma/basicdoc-models | `3b408b71` | base grammar |',
  '| metanorma/relaton-models | `afa81f5e` | relaton grammar sources |',
  '| metanorma/metanorma-requirements-models | `3e49a518` | requirements grammar |',
  '| metanorma/metanorma | `de1e757d` | pipeline |',
  '| metanorma/isodoc | `cbbdc3b1` | renderer |',
];

function ledger(rows) {
  const head = ['| Repository | Commit | Role |', '|---|---|---|'];
  return [
    '# Doc', '', '## 1. Verification ledger', '', ...head, ...rows, '',
    '## 2. Pipeline and artifacts', '',
    '| Element | Verified shape |', '|---|---|',
    '| root `metanorma` | `bibdata` required |', '',
  ].join('\n');
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// --- parsePins ---

test('parsePins reads the real ledger: exactly the seven table pins', async () => {
  const content = await readFile(ledgerPath, 'utf8');
  const { pins, unrecognized } = parsePins(content);
  assert.deepEqual(unrecognized, []);
  assert.equal(pins.length, 7);
  assert.deepEqual(
    pins.map((p) => p.repo),
    [
      'metanorma/metanorma-standoc',
      'metanorma/standoc-models',
      'metanorma/basicdoc-models',
      'metanorma/relaton-models',
      'metanorma/metanorma-requirements-models',
      'metanorma/metanorma',
      'metanorma/isodoc',
    ],
  );
  assert.ok(pins.every((p) => /^[0-9a-f]{7,40}$/.test(p.commit)));
});

test('parsePins ignores backticked prose SHAs in §1 body text', () => {
  const prose = [
    'Upstream commit `4bad36724d` renamed `isodoc.rnc`; the re-sync',
    '`8bb23fd5631e` and the flip `80892abc` (submodule `50fe9e85`) are',
    'prose references, not pins.',
  ].join('\n');
  const content = ledger(PINS).replace('## 2. Pipeline', `${prose}\n\n## 2. Pipeline`);
  const { pins } = parsePins(content);
  assert.equal(pins.length, 7);
  assert.ok(!pins.some((p) => ['4bad36724d', '8bb23fd5631e', '80892abc', '50fe9e85']
    .includes(p.commit)));
});

test('parsePins is tolerant of alignment and row order', () => {
  const reordered = [
    '|   metanorma/isodoc   |   `cbbdc3b1`   | renderer |',
    '| metanorma/standoc-models | `7d5d737c` | sources |',
    '| metanorma/metanorma-standoc | `ba325b0e` | converter |',
    '| metanorma/basicdoc-models | `3b408b71` | base |',
    '| metanorma/metanorma | `de1e757d` | pipeline |',
  ];
  const { pins } = parsePins(ledger(reordered));
  assert.equal(pins.length, 5);
  assert.equal(pins[0].repo, 'metanorma/isodoc');
  assert.equal(pins[0].commit, 'cbbdc3b1');
});

test('parsePins flags malformed pin rows instead of dropping them silently', () => {
  // Commit cell without backticks: not a pin row, but not header/separator
  // either — must surface as unrecognized so lint fails loudly.
  const rows = [...PINS.slice(0, 4), '| metanorma/isodoc | cbbdc3b1 | renderer |'];
  const { pins, unrecognized } = parsePins(ledger(rows));
  assert.equal(pins.length, 4);
  assert.equal(unrecognized.length, 1);
});

test('parsePins never reaches tables outside §1', () => {
  const content = [
    '# Doc', '', '## 1. Verification ledger', '',
    '| Repository | Commit | Role |', '|---|---|---|', ...PINS, '',
    '## 4. Element models', '',
    '| root | `ba325b0e` | shape |', '| `metanorma/x` | `deadbee1` | x |', '',
  ].join('\n');
  const { pins, unrecognized } = parsePins(content);
  assert.equal(pins.length, 7);
  assert.deepEqual(unrecognized, []);
});

// --- parseArgv ---

test('parseArgv defaults to lint and parses all flags', () => {
  const opts = parseArgv([
    'drift',
    '--only', 'metanorma/standoc-models',
    '--only', 'metanorma/isodoc',
    '--base', 'metanorma/standoc-models=4bad3672^',
    '--head', 'metanorma/isodoc=v2.0.0',
    '--table', '/tmp/scratch.md',
    '--out-dir', '/tmp/out',
    '--status-file', '/tmp/s.json',
  ]);
  assert.equal(opts.mode, 'drift');
  assert.deepEqual([...opts.only], ['metanorma/standoc-models', 'metanorma/isodoc']);
  assert.equal(opts.base.get('metanorma/standoc-models'), '4bad3672^');
  assert.equal(opts.head.get('metanorma/isodoc'), 'v2.0.0');
  assert.equal(opts.table, '/tmp/scratch.md');
  assert.equal(opts.outDir, '/tmp/out');
  assert.equal(opts.statusFile, '/tmp/s.json');
});

test('parseArgv: bare invocation is lint; bad input is a UsageError', () => {
  assert.equal(parseArgv([]).mode, 'lint');
  assert.throws(() => parseArgv(['nope']), /unknown mode/);
  assert.throws(() => parseArgv(['--wat']), /unknown option/);
  assert.throws(() => parseArgv(['--base', 'not-an-assignment']), /org\/repo=ref/);
  assert.throws(() => parseArgv(['--base']), /missing value/);
});

test('parseArgv: CHECK_PINS_BASE_OVERRIDE env equals the --base flag and wins', () => {
  const fromEnv = parseArgv([], { CHECK_PINS_BASE_OVERRIDE: 'a/b=ref1' });
  assert.equal(fromEnv.base.get('a/b'), 'ref1');
  const fromBoth = parseArgv(['--base', 'a/b=cli'], { CHECK_PINS_BASE_OVERRIDE: 'a/b=env' });
  assert.equal(fromBoth.base.get('a/b'), 'env');
  assert.throws(
    () => parseArgv([], { CHECK_PINS_BASE_OVERRIDE: 'bogus' }),
    /org\/repo=ref/,
  );
});

// --- diffTrees / classifyHint (gitlink watching) ---

const mkTree = (rows) => rows.map(([type, path, sha]) => ({ type, path, sha }));
const FULL_TREE_CFG = { fail: ['**'], report: [] };

test('diffTrees: a gitlink sha bump is fail-tier drift with a pointer hint', () => {
  const base = mkTree([
    ['commit', 'grammars/relaton-models', 'afa81f5e'],
    ['blob', 'grammars/standoc.rnc', 'bbb2222'],
  ]);
  const head = mkTree([
    ['commit', 'grammars/relaton-models', '1b4ba894'],
    ['blob', 'grammars/standoc.rnc', 'bbb2222'],
  ]);
  const d = diffTrees(base, head, FULL_TREE_CFG);
  assert.deepEqual(d.fail.changed, ['grammars/relaton-models']);
  assert.deepEqual(d.fail.added, []);
  assert.deepEqual(d.fail.removed, []);
  assert.equal(d.gitlinks.has('grammars/relaton-models'), true);
  assert.equal(
    classifyHint(d.fail.changed, d.gitlinks),
    'submodule pointer bump(s): grammars/relaton-models',
  );
});

test('diffTrees: gitlink added/removed is a path-set diff', () => {
  const base = mkTree([
    ['commit', 'grammars/relaton-model-iso', 'aaa0000'],
    ['blob', 'grammars/standoc.rnc', 'bbb2222'],
  ]);
  const head = mkTree([
    ['commit', 'grammars/relaton-models', 'ccc3333'],
    ['blob', 'grammars/standoc.rnc', 'bbb2222'],
  ]);
  const d = diffTrees(base, head, FULL_TREE_CFG);
  assert.deepEqual(d.fail.removed, ['grammars/relaton-model-iso']);
  assert.deepEqual(d.fail.added, ['grammars/relaton-models']);
  assert.match(classifyHint(
    [...d.fail.added, ...d.fail.removed], d.gitlinks,
  ), /^submodule pointer bump\(s\)/);
});

test('diffTrees: blob-only change keeps the ordinary hints (regression)', () => {
  const base = mkTree([['blob', 'grammars/standoc.rnc', 'bbb2222']]);
  const head = mkTree([['blob', 'grammars/standoc.rnc', 'ddd4444']]);
  const d = diffTrees(base, head, FULL_TREE_CFG);
  assert.deepEqual(d.fail.changed, ['grammars/standoc.rnc']);
  assert.equal(classifyHint(d.fail.changed, d.gitlinks), 'grammar sources (grammars/)');
  const outside = diffTrees(
    mkTree([['blob', 'profiles/x.yaml', 'a1']]),
    mkTree([['blob', 'profiles/x.yaml', 'b2']]),
    FULL_TREE_CFG,
  );
  assert.match(classifyHint(outside.fail.changed, outside.gitlinks), /^outside grammars\//);
});

test('diffTrees: mixed blob + gitlink change → mixed hint', () => {
  const base = mkTree([
    ['commit', 'grammars/basicdoc-models', 'aaa0000'],
    ['blob', 'grammars/standoc.rnc', 'bbb2222'],
  ]);
  const head = mkTree([
    ['commit', 'grammars/basicdoc-models', 'eee5555'],
    ['blob', 'grammars/standoc.rnc', 'ddd4444'],
  ]);
  const d = diffTrees(base, head, FULL_TREE_CFG);
  assert.deepEqual([...d.fail.changed].sort(),
    ['grammars/basicdoc-models', 'grammars/standoc.rnc']);
  assert.equal(
    classifyHint(d.fail.changed, d.gitlinks),
    'mixed: grammar sources, structure, and/or submodule pointers',
  );
});



test('lint passes a consistent scratch table', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'check-pins-'));
  const table = join(dir, 'ledger.md');
  await writeFile(table, ledger(PINS));
  const r = run(['lint', '--table', table]);
  assert.equal(r.status, 0, r.stderr);
});

test('lint fails both consistency directions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'check-pins-'));

  const extra = join(dir, 'extra.md');
  await writeFile(extra, ledger([...PINS, '| someone/other | `abc1234` | x |']));
  const r1 = run(['lint', '--table', extra]);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /not in sensitivity map: someone\/other/);

  const missing = join(dir, 'missing.md');
  await writeFile(missing, ledger(PINS.slice(0, 4)));
  const r2 = run(['lint', '--table', missing]);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /map entry not in pin table: metanorma\/isodoc/);

  const malformed = join(dir, 'malformed.md');
  await writeFile(malformed, ledger([...PINS.slice(0, 4), '| metanorma/isodoc | cbbdc3b1 | x |']));
  const r3 = run(['lint', '--table', malformed]);
  assert.equal(r3.status, 1);
  assert.match(r3.stderr, /unrecognized table row/);
});

test('drift exits 2 at the consistency check, before any network call', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'check-pins-'));
  const table = join(dir, 'bogus.md');
  await writeFile(table, ledger([...PINS, '| someone/other | `abc1234` | x |']));
  const r = run(['drift', '--table', table]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /config error, no network/);
});

// --- gate (offline CLI, fixture status files) ---

test('gate relays the status taxonomy: clean / drift / error / missing / corrupt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'check-pins-gate-'));
  const status = (repos) => writeFile(
    join(dir, 's.json'),
    JSON.stringify({ generatedAt: 'now', repos }),
  );

  await status({
    'a/b': { status: 'clean' },
    'c/d': { status: 'drift-report' },
  });
  assert.equal(run(['gate', '--status-file', join(dir, 's.json')]).status, 0);

  // Partial drift: B drifted while A stays clean — the job must go red.
  await status({
    'a/b': { status: 'clean' },
    'c/d': { status: 'drift-fail' },
  });
  assert.equal(run(['gate', '--status-file', join(dir, 's.json')]).status, 1);

  // All-error (rate limit / truncated tree mid-run): never silently green.
  await status({ 'a/b': { status: 'error', message: 'boom' } });
  assert.equal(run(['gate', '--status-file', join(dir, 's.json')]).status, 2);

  // An entry with no status at all is invalid, not clean.
  await status({ 'a/b': {} });
  assert.equal(run(['gate', '--status-file', join(dir, 's.json')]).status, 2);

  assert.equal(run(['gate', '--status-file', join(dir, 'absent.json')]).status, 2);

  await writeFile(join(dir, 'corrupt.json'), '{"repos":');
  assert.equal(run(['gate', '--status-file', join(dir, 'corrupt.json')]).status, 2);

  await writeFile(join(dir, 'wrong.json'), '[]');
  assert.equal(run(['gate', '--status-file', join(dir, 'wrong.json')]).status, 2);
});
