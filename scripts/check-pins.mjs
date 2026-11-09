#!/usr/bin/env node

// Upstream pin drift checker for docs/metanorma-model.md §1.
//
// The ledger's pin table ("| Repository | Commit | Role |") is the single
// source of truth for which upstream commits the recorded facts were
// verified against. This script parses that table (parsePins) and answers
// one question: has upstream moved, at the paths the ledger cites, since
// the pin? The pin is the baseline — nothing is stored between runs; blob
// SHAs from the GitHub trees API are content hashes, so no normalization
// and no vendored copies are needed.
//
// Modes:
//   lint (default; `yarn check-pins`) — offline. Parses the §1 table and
//     checks it against the sensitivity map below in both directions.
//     Wired into CI (.github/workflows/docs.yml) so a mangled table fails
//     the PR, not a later drift run.
//   drift — per repo: resolve the pin, fetch recursive git trees at the
//     pin and at the default branch, filter by the sensitivity map, diff
//     path sets + blob SHAs. Writes artifacts to .drift/ (drift-status.json
//     atomically, plus report / issue-body / digest files) and exits
//     0 clean / 1 any fail-tier drift / 2 config or infra error.
//   gate — relays .drift/drift-status.json to an exit code: 1 on any
//     drift-fail; 2 on any per-repo error, or a missing/corrupt/unparseable
//     status file. The drift CI step runs continue-on-error, so gate is the
//     job's only red/green relay — an all-error run must end red, never
//     silently green.
//
// Sensitivity map: a deliberate hardcoded list — the inverse of
// docs/CONVENTIONS.md §7's "no hardcoded spec lists" spirit. It is safe
// because lint fails in both directions on any table↔map mismatch, and it
// is cite-driven: the fail tier is exactly the upstream paths the ledger
// cites as verification sources; the report tier is the enclosing subtrees,
// watched for restructures. Tiers are one-line retunable if noise proves
// wrong.
//
// Accepted cadence: metanorma-standoc's cited files are hot upstream. The
// daily job is therefore expected red with a drift issue open between its
// releases and the next re-pin. Red means "the ledger is stale relative to
// upstream" — information, not an error state. The exit for verified
// no-semantic-change drift is the fast path: re-pin + bump the Re-verified
// date in the ledger's Re-verification paragraph + a one-line comment, in
// one commit.
//
// Overrides (composable, offline-testable):
//   --only org/repo        process only this repo (validation stays global)
//   --base org/repo=ref    diff this repo against <ref>, not its pin
//   --head org/repo=ref    diff against <ref>, not the default branch
//   --table path           read the ledger from path (scratch-table runs)
//   --out-dir path         artifact directory (default .drift)
//   --status-file path     gate: read this status file
//   CHECK_PINS_BASE_OVERRIDE  env form of --base (one org/repo=ref) — the
//                             workflow_dispatch smoke hook; parsed by the
//                             same assignment parser.
//
// Zero runtime dependencies — Node builtins + global fetch. The GitHub API
// calls in drift mode want GITHUB_TOKEN in the environment (25-30 requests
// per run; the unauthenticated 60 req/hr shared budget is not reliable).

import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TABLE = join(root, 'docs', 'metanorma-model.md');
const DEFAULT_OUT_DIR = '.drift';
const API = 'https://api.github.com';

// Cite-driven two-tier watch map. fail = paths the ledger cites as
// verification sources for recorded facts at the §1 pins
// (docs/metanorma-model.md); report = enclosing subtrees, for restructure
// awareness (e.g. the 2026-09 lib flattening class of path-set events).
// Files matching both tiers count as fail.
const SENSITIVITY = {
  'metanorma/metanorma-standoc': {
    fail: [
      'lib/metanorma/validate/**',
      'lib/metanorma/converter/base.rb',
      'lib/metanorma/converter/blocks.rb',
      'lib/metanorma/cleanup/inline.rb',
      // Figure/image size family (ledger §4 rows + size-semantics note,
      // verified 2026-11-05): converter emission sources + the corroborating
      // spec fixture.
      'lib/metanorma/converter/inline.rb',
      'lib/metanorma/converter/blocks_image.rb',
      'spec/metanorma/blocks_spec.rb',
      // Error-ID registry (ledger §7; verified 2026-11-09)
      'lib/metanorma/converter/log.rb',
    ],
    report: ['lib/metanorma/converter/**', 'lib/metanorma/cleanup/**'],
  },
  'metanorma/standoc-models': { fail: ['**'], report: [] },
  'metanorma/basicdoc-models': { fail: ['**'], report: [] },
  'metanorma/relaton-models': { fail: ['**'], report: [] },
  'metanorma/metanorma-requirements-models': { fail: ['**'], report: [] },
  'metanorma/metanorma': {
    fail: ['lib/metanorma/compile/compile.rb', 'lib/metanorma/compile/render.rb'],
    report: ['lib/metanorma/compile/**'],
  },
  'metanorma/isodoc': {
    fail: ['lib/isodoc/presentation_function/ids.rb'],
    report: ['lib/isodoc/**'],
  },
};

const USAGE = `Usage: check-pins.mjs [lint|drift|gate] [options]
  lint   (default) offline: parse the ledger pin table, check map consistency
  drift  fetch trees at pin and default branch, diff watched paths
  gate   relay .drift/drift-status.json to an exit code
Options:
  --only org/repo      --base org/repo=ref   --head org/repo=ref
  --table path         --out-dir path        --status-file path
Env: CHECK_PINS_BASE_OVERRIDE='org/repo=ref' (same parser as --base)`;

class UsageError extends Error {}
class GhError extends Error {

  constructor(status, path) {
    super(`GitHub API ${status}: ${path}`);
    this.status = status;
  }

}


// --- pure helpers (exported for tests) ---


/**
 * Parse the §1 pin table out of the ledger markdown.
 *
 * Anchored to the "## 1. Verification ledger" heading and bounded by the
 * next "## " heading, so other tables in the document (e.g. §4's element
 * table) can never be mis-grabbed. Rows are matched by shape — `org/repo`
 * first cell, backticked 7-40 hex commit second cell — so whitespace,
 * column alignment, and row order are all tolerated. Backticked SHAs that
 * appear in §1 prose (4bad36724d, 8bb23fd5631e, 80892abc, 50fe9e85) are
 * not table rows and are ignored. Returns { pins, unrecognized }.
 */
export function parsePins(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^##\s+1\.\s+Verification ledger\s*$/.test(l));
  if (start === -1) return { pins: [], unrecognized: [] };
  const rowRe = /^\|\s*([\w.-]+\/[\w.-]+)\s*\|\s*`([0-9a-fA-F]{7,40})`\s*\|/;
  const skipRe = /^\|\s*(?:[-:| ]+\||Repository\b)/;
  const pins = [];
  const unrecognized = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) break;
    if (!line.startsWith('|')) continue;
    const m = rowRe.exec(line);
    if (m) {
      pins.push({ repo: m[1], commit: m[2] });
    } else if (!skipRe.test(line)) {
      unrecognized.push(line.trim());
    }
  }
  return { pins, unrecognized };
}


const assignRe = /^([\w.-]+\/[\w.-]+)=(.+)$/;

/**
 * Parse one `org/repo=ref` assignment (shared by --base/--head and the
 * CHECK_PINS_BASE_OVERRIDE env form). Throws UsageError on bad shape.
 */
function parseAssignment(s) {
  const m = assignRe.exec(s);
  if (!m) throw new UsageError(`expected org/repo=ref, got: ${s}`);
  return { repo: m[1], ref: m[2] };
}


/**
 * Parse CLI arguments and the CHECK_PINS_BASE_OVERRIDE env override into
 * one resolved options object. Pure — no process access beyond its args.
 * The env override is applied after CLI flags and wins on conflict.
 */
export function parseArgv(argv, env = {}) {
  const opts = {
    mode: 'lint',
    only: new Set(),
    base: new Map(),
    head: new Map(),
    table: DEFAULT_TABLE,
    outDir: DEFAULT_OUT_DIR,
    statusFile: null,
  };
  const args = [...argv];
  if (args.length > 0 && !args[0].startsWith('-')) {
    const mode = args.shift();
    if (!['lint', 'drift', 'gate'].includes(mode)) {
      throw new UsageError(`unknown mode: ${mode}`);
    }
    opts.mode = mode;
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => {
      i += 1;
      if (i >= args.length) throw new UsageError(`missing value for ${a}`);
      return args[i];
    };
    if (a === '--only') opts.only.add(value());
    else if (a === '--base') {
      const { repo, ref } = parseAssignment(value());
      opts.base.set(repo, ref);
    } else if (a === '--head') {
      const { repo, ref } = parseAssignment(value());
      opts.head.set(repo, ref);
    } else if (a === '--table') opts.table = value();
    else if (a === '--out-dir') opts.outDir = value();
    else if (a === '--status-file') opts.statusFile = value();
    else throw new UsageError(`unknown option: ${a}`);
  }
  if (env.CHECK_PINS_BASE_OVERRIDE) {
    const { repo, ref } = parseAssignment(env.CHECK_PINS_BASE_OVERRIDE);
    opts.base.set(repo, ref);
  }
  return opts;
}


// --- glob matching ---


const globCache = new Map();

/** Compile `**`, `*` glob to a RegExp over slash-separated paths. */
function globToRegExp(pattern) {
  if (pattern === '**') return /^.*$/;
  const out = ['^'];
  const segs = pattern.split('/');
  segs.forEach((seg, i) => {
    if (seg === '**') {
      out.push('(?:[^/]+/)*');
      return;
    }
    out.push(seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'));
    if (i < segs.length - 1) out.push('/');
  });
  let re = out.join('');
  if (re.endsWith('/')) re = re.slice(0, -1);
  globCache.set(pattern, new RegExp(re + '$'));
  return globCache.get(pattern);
}

function matchesGlob(pattern, path) {
  return globToRegExp(pattern).test(path);
}

/** Tier of a path under a repo's config; fail wins over report. */
function matchTier(cfg, path) {
  if (cfg.fail.some((g) => matchesGlob(g, path))) return 'fail';
  if (cfg.report.some((g) => matchesGlob(g, path))) return 'report';
  return null;
}

/** Filter a tree's watched entries — blobs and submodule gitlinks — into
 *  per-tier path→sha maps. A gitlink's sha is the submodule's pinned
 *  commit, so a pointer bump diffs like any content change. */
function filterTree(entries, cfg) {
  const fail = new Map();
  const report = new Map();
  for (const e of entries) {
    if (e.type !== 'blob' && e.type !== 'commit') continue;
    const tier = matchTier(cfg, e.path);
    if (tier === 'fail') fail.set(e.path, e.sha);
    else if (tier === 'report') report.set(e.path, e.sha);
  }
  return { fail, report };
}


/**
 * Filter two tree listings by the sensitivity map and diff them per tier.
 * Pure — synthetic tree fixtures drive its tests. Returns the per-tier
 * diffs plus the set of gitlink paths appearing in either tree, so the
 * triage hint can name pointer bumps: a models-side submodule refresh
 * must surface at the source, not only later at vendoring.
 */
export function diffTrees(baseTree, headTree, cfg) {
  const base = filterTree(baseTree, cfg);
  const head = filterTree(headTree, cfg);
  const gitlinks = new Set([
    ...baseTree, ...headTree,
  ].filter((e) => e.type === 'commit').map((e) => e.path));
  return {
    fail: diffTier(base.fail, head.fail),
    report: diffTier(base.report, head.report),
    gitlinks,
  };
}


// --- diffing ---


/** Diff two path→sha maps into added/removed/changed path lists. */
function diffTier(pinMap, headMap) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [path, sha] of headMap) {
    if (!pinMap.has(path)) added.push(path);
    else if (pinMap.get(path) !== sha) changed.push(path);
  }
  for (const path of pinMap.keys()) {
    if (!headMap.has(path)) removed.push(path);
  }
  return { added, removed, changed };
}

const nonEmpty = (d) => d.added.length + d.removed.length + d.changed.length;

/** Stable short signature of a changed-path set (sorted, hashed). */
function signatureOf(paths) {
  const list = [...new Set(paths)].sort();
  return createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 16);
}

/**
 * Triage hint for full-tree repos: is the fail-tier change inside the
 * grammar sources, or structural (new layer, rename, files outside
 * grammars/)? Aimed at the human's first two seconds with the issue.
 */
export function classifyHint(paths, gitlinks = new Set()) {
  const bumps = paths.filter((p) => gitlinks.has(p));
  if (bumps.length === paths.length) {
    const names = bumps.slice(0, 5).join(', ');
    const more = bumps.length > 5 ? ` (+${bumps.length - 5} more)` : '';
    return `submodule pointer bump(s): ${names}${more}`;
  }
  const blobs = paths.filter((p) => !gitlinks.has(p));
  const inGrammars = blobs.filter((p) => p.startsWith('grammars/')).length;
  if (bumps.length === 0 && inGrammars === blobs.length) {
    return 'grammar sources (grammars/)';
  }
  if (bumps.length === 0 && inGrammars === 0) {
    return 'outside grammars/ — structural (new layer, rename, or non-grammar tree change)';
  }
  return 'mixed: grammar sources, structure, and/or submodule pointers';
}


// --- consistency (lint + drift preflight) ---


/**
 * Bidirectional table↔map consistency: every pinned repo must be watched,
 * and every watched repo must still be pinned. Also flags §1 table rows
 * that look like pin rows but do not parse. Returns error strings.
 */
function consistencyErrors(pins, unrecognized) {
  const errors = [];
  for (const row of unrecognized) {
    errors.push(`§1 has an unrecognized table row: ${row.slice(0, 80)}`);
  }
  const repos = new Set(pins.map((p) => p.repo));
  for (const p of pins) {
    if (!SENSITIVITY[p.repo]) {
      errors.push(`pinned repo not in sensitivity map: ${p.repo}`);
    }
  }
  for (const repo of Object.keys(SENSITIVITY)) {
    if (!repos.has(repo)) {
      errors.push(`sensitivity map entry not in pin table: ${repo}`);
    }
  }
  return errors;
}


// --- GitHub API ---


async function gh(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'reflect-check-pins',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new GhError(res.status, path);
  return res.json();
}

async function resolveRef(repo, ref, token) {
  const commit = await gh(`/repos/${repo}/commits/${ref}`, token);
  return commit.sha;
}

async function fetchTree(repo, ref, token) {
  const tree = await gh(`/repos/${repo}/git/trees/${ref}?recursive=1`, token);
  if (tree.truncated) {
    throw new Error(`truncated tree listing for ${repo}@${ref}`);
  }
  return tree.tree ?? [];
}


// --- drift mode ---


/**
 * One fail-tier glob is satisfiable at the pin tree: an exact path exists,
 * or a dir/** glob has at least one entry. A glob that is not satisfiable
 * means the ledger cites a path that no longer exists at the pin — a
 * stale cite, config class.
 */
function staleCites(cfg, pinTree) {
  const paths = new Set(pinTree.map((e) => e.path));
  const stale = [];
  for (const g of cfg.fail) {
    if (g === '**') continue;
    if (g.endsWith('/**')) {
      const prefix = g.slice(0, -2);
      if (![...paths].some((p) => p.startsWith(prefix))) stale.push(g);
    } else if (!paths.has(g)) {
      stale.push(g);
    }
  }
  return stale;
}


async function driftRepo(pin, opts, token) {
  const cfg = SENSITIVITY[pin.repo];
  const entry = {
    status: 'clean',
    failSignature: signatureOf([]),
    reportSignature: signatureOf([]),
    base: null,
    head: null,
    compare: null,
    fail: { added: [], removed: [], changed: [] },
    report: { added: [], removed: [], changed: [] },
    hint: null,
    message: null,
  };
  try {
    const pinSha = await resolveRef(pin.repo, pin.commit, token);
    const baseRef = opts.base.get(pin.repo) ?? pinSha;
    const baseSha = baseRef === pinSha ? pinSha : await resolveRef(pin.repo, baseRef, token);
    const info = await gh(`/repos/${pin.repo}`, token);
    const headRef = opts.head.get(pin.repo) ?? info.default_branch;
    const headSha = await resolveRef(pin.repo, headRef, token);

    const pinTree = await fetchTree(pin.repo, pinSha, token);
    const stale = staleCites(cfg, pinTree);
    if (stale.length > 0) {
      entry.status = 'error';
      entry.message = `stale ledger cite: fail-tier path(s) missing at pin: ${stale.join(', ')}`;
      return entry;
    }
    // The diff base is the override ref if given, else the pin itself.
    // (The stale-cite assertion above always runs against the PIN tree.)
    const baseTree = baseSha === pinSha
      ? pinTree
      : await fetchTree(pin.repo, baseSha, token);
    const headTree = await fetchTree(pin.repo, headSha, token);

    const { fail, report, gitlinks } = diffTrees(baseTree, headTree, cfg);
    entry.fail = fail;
    entry.report = report;
    entry.base = baseSha;
    entry.head = headSha;
    entry.compare = `https://github.com/${pin.repo}/compare/${baseSha}...${headSha}`;

    const failPaths = [
      ...entry.fail.added, ...entry.fail.removed, ...entry.fail.changed,
    ];
    const reportPaths = [
      ...entry.report.added, ...entry.report.removed, ...entry.report.changed,
    ];
    entry.failSignature = signatureOf(failPaths);
    entry.reportSignature = signatureOf(reportPaths);
    if (failPaths.length > 0) {
      entry.status = 'drift-fail';
      if (cfg.fail.includes('**')) entry.hint = classifyHint(failPaths, gitlinks);
    } else if (reportPaths.length > 0) {
      entry.status = 'drift-report';
    }
  } catch (err) {
    entry.status = 'error';
    const rate = err instanceof GhError && [403, 429].includes(err.status)
      ? ' (rate-limited? GITHUB_TOKEN missing?)' : '';
    entry.message = `${err.message}${rate}`;
  }
  return entry;
}


// --- report / artifact rendering ---


const short = (sha) => (sha ? sha.slice(0, 7) : '?');
const LIST_CAP = 40;

function listLines(diff) {
  const lines = [];
  const emit = (marker, paths) => {
    paths.slice(0, LIST_CAP).forEach((p) => lines.push(`  ${marker} ${p}`));
    if (paths.length > LIST_CAP) lines.push(`  … and ${paths.length - LIST_CAP} more`);
  };
  emit('+', diff.added);
  emit('-', diff.removed);
  emit('~', diff.changed);
  return lines;
}

function renderReport(entries) {
  const out = [`# Upstream drift report — ${new Date().toISOString()}`, ''];
  for (const [repo, e] of entries) {
    const label = e.status === 'drift-fail'
      ? 'DRIFT (fail tier)'
      : e.status === 'drift-report'
        ? 'moved (report-only tier)'
        : e.status === 'error'
          ? 'ERROR'
          : 'clean';
    out.push(`## ${repo} — ${label}`);
    if (e.status === 'error') {
      out.push('', `  ${e.message}`, '');
      continue;
    }
    out.push(`  base ${short(e.base)} → head ${short(e.head)}`);
    if (e.compare && e.base !== e.head) out.push(`  compare: ${e.compare}`);
    if (e.hint) out.push(`  change is in: ${e.hint}`);
    out.push(`  fail tier: ${nonEmpty(e.fail)} path(s), report tier: ${nonEmpty(e.report)} path(s)`);
    out.push(...listLines(e.fail));
    out.push(...listLines(e.report));
    out.push('');
  }
  out.push('---', '', COVERAGE_NOTE, '');
  return out.join('\n');
}

// Standing coverage disclosure: ledger facts whose sources are NOT pinned
// in §1, and therefore not watched. Green means "nothing watched moved" —
// never "the ledger is current". Extend this list when the ledger gains a
// fact citing another unpinned source.
const COVERAGE_NOTE = [
  'Coverage — not watched: facts citing unpinned sources:',
  '  metanorma/metanorma-utils      (§5: random_uuid / contenthash algorithms)',
  '  metanorma/plurimath            (§2: MathML content check)',
  '  metanorma.org validation page  (§7: error-ID scheme/categories/severity)',
].join('\n');

const CHECKLIST = `## Human interpretation loop

Triage:
- [ ] Read the classification above; open the compare link; read the
      upstream commit messages.
- [ ] If the change cannot touch any recorded fact, close this issue with
      a one-line note.

Interpret:
- [ ] Map each changed path to the ledger sections citing it
      (\`docs/metanorma-model.md\`), and via them to the consuming specs
      (\`yarn spec-impact docs/schema.spec.md\`).

Rewrite:
- [ ] Rewrite affected ledger/spec prose as current state
      (docs/CONVENTIONS.md §4); add a CHANGELOG entry if the bar is met.

Re-pin (same commit as the rewrite):
- [ ] Bump this repo's §1 pin to the reviewed head SHA.
- [ ] Bump the Re-verified date in the ledger's Re-verification paragraph
      (§1) — the pin bump always travels with its interpretation.

Fast path (verified: no semantic change): re-pin + Re-verified date bump +
a one-line "verified: no semantic change" comment here, in one commit.`;

function renderIssueBody(repo, e) {
  const lines = [
    `<!-- check-pins failSignature: ${e.failSignature} -->`,
    '',
    `Upstream has moved under the fail-tier watch for **${repo}**`,
    `since the ledger pin (base \`${short(e.base)}\` → head \`${short(e.head)}\`).`,
    '',
    `Compare: ${e.compare}`,
  ];
  if (e.hint) lines.push(`Change is in: ${e.hint}`);
  lines.push('', '### Fail-tier paths', '');
  lines.push(...listLines(e.fail));
  if (nonEmpty(e.report) > 0) {
    lines.push('', '### Report-tier paths (context)', '');
    lines.push(...listLines(e.report));
  }
  lines.push('', CHECKLIST, '');
  return lines.join('\n');
}

function renderDigest(entries) {
  const moved = [...entries].filter(([, e]) => e.status === 'drift-report');
  if (moved.length === 0) return '';
  const lines = ['Report-only tier movement (digest — no action required):', ''];
  for (const [repo, e] of moved) {
    lines.push(`- **${repo}** — ${nonEmpty(e.report)} report-tier path(s)`);
    lines.push(...listLines(e.report).map((l) => `  ${l}`));
    if (e.compare) lines.push(`  compare: ${e.compare}`);
  }
  return lines.join('\n');
}

function renderWatchBody(markers) {
  return [
    '<!-- check-pins watch markers (machine-owned):',
    markers,
    '-->',
    '',
    '# Upstream watch — report-only digest',
    '',
    'Low-volume log of upstream movement on report-only tiers. Comments are',
    'added only when a repo\'s report-tier signature changes. Opt-in: watch',
    'this issue to see them; nothing here requires action. Fail-tier drift',
    'lands in `drift`-labelled issues instead.',
  ].join('\n');
}


async function atomicWrite(file, content) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}


async function runDrift(opts) {
  const token = process.env.GITHUB_TOKEN ?? null;
  const content = await readFile(opts.table, 'utf8');
  const { pins, unrecognized } = parsePins(content);
  if (pins.length === 0) {
    console.error("✗ no pins parsed from the ledger table — refusing to run.");
    return 2;
  }
  const consistency = consistencyErrors(pins, unrecognized);
  if (consistency.length > 0) {
    console.error("✗ pin table / sensitivity map inconsistent (config error, no network):");
    consistency.forEach((e) => console.error(`  ${e}`));
    return 2;
  }

  const selected = pins.filter((p) => opts.only.size === 0 || opts.only.has(p.repo));
  const entries = new Map();
  for (const pin of selected) {
    entries.set(pin.repo, await driftRepo(pin, opts, token));
  }

  const statuses = [...entries.values()].map((e) => e.status);
  const anyFail = statuses.includes('drift-fail');
  const anyError = statuses.includes('error');

  // Artifacts (issue ops read these; never write partial JSON).
  const outDir = resolve(root, opts.outDir);
  await mkdir(join(outDir, 'issues'), { recursive: true });
  const status = { generatedAt: new Date().toISOString(), repos: Object.fromEntries(entries) };
  await atomicWrite(join(outDir, 'drift-status.json'), `${JSON.stringify(status, null, 2)}\n`);
  const report = renderReport(entries);
  await writeFile(join(outDir, 'drift-report.md'), `${report}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
  for (const [repo, e] of entries) {
    if (e.status === 'drift-fail') {
      const slug = repo.replace('/', '-');
      await writeFile(join(outDir, 'issues', `${slug}.md`), renderIssueBody(repo, e));
    }
  }
  const digest = renderDigest(entries);
  if (digest) await writeFile(join(outDir, 'digest-comment.md'), `${digest}\n`);
  const markers = [...entries]
    .map(([repo, e]) => `${repo}=${e.reportSignature}`)
    .join(';');
  await writeFile(join(outDir, 'watch-body.md'), `${renderWatchBody(markers)}\n`);
  await writeFile(join(outDir, 'watch-markers.txt'), `${markers}\n`);

  console.log(report);
  if (anyFail) {
    console.error("✗ fail-tier drift detected — see the report and drift-status.json.");
    return 1;
  }
  if (anyError) {
    console.error("✗ per-repo error(s) — infra/config; no issue will be filed for them.");
    return 2;
  }
  console.log("✓ pins match upstream at every watched path.");
  return 0;
}


// --- lint mode ---


async function runLint(opts) {
  const content = await readFile(opts.table, 'utf8');
  const { pins, unrecognized } = parsePins(content);
  const errors = [];
  if (pins.length === 0) errors.push('no pins parsed from the ledger table');
  errors.push(...consistencyErrors(pins, unrecognized));
  if (errors.length > 0) {
    console.error("✗ Pin-table check failed:");
    errors.forEach((e) => console.error(`  ${e}`));
    return 1;
  }
  console.log(`✓ Pin-table check passed (${pins.length} repos, map consistent both ways).`);
  return 0;
}


// --- gate mode ---


async function runGate(opts) {
  const file = opts.statusFile ?? join(resolve(root, opts.outDir), 'drift-status.json');
  let status;
  try {
    status = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    console.error(`✗ gate: missing/corrupt/unparseable status file: ${file}`);
    return 2;
  }
  const repos = status?.repos;
  if (!repos || typeof repos !== 'object') {
    console.error(`✗ gate: status file has no repos object: ${file}`);
    return 2;
  }
  const values = Object.values(repos);
  if (values.some((e) => e?.status === 'drift-fail')) {
    console.error("✗ gate: fail-tier drift present.");
    return 1;
  }
  if (values.some((e) => e?.status === 'error' || !e?.status)) {
    console.error("✗ gate: per-repo error or invalid status present.");
    return 2;
  }
  console.log(`✓ gate: clean (${values.length} repos).`);
  return 0;
}


// --- main ---


async function main() {
  let opts;
  try {
    opts = parseArgv(process.argv.slice(2), process.env);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n\n${USAGE}`);
      process.exit(2);
    }
    throw err;
  }
  const code = opts.mode === 'drift'
    ? await runDrift(opts)
    : opts.mode === 'gate'
      ? await runGate(opts)
      : await runLint(opts);
  process.exit(code);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
