#!/usr/bin/env node

// Spec cross-reference integrity checker.
//
// Validates that every relative markdown link in the spec files — docs/**/*.md
// plus every colocated pkg/<pkg>/README.spec.md and in-package suite
// pkg/<pkg>/docs/**/*.md (placements per CONVENTIONS.md §1.1) — resolves to
// an existing file, that any link anchor names a heading of the target file
// (GitHub slug rules), that no spec carries
// the removed **Spec version:** / **Spec dependencies:** header lines, that
// specs are free of transition prose (per CONVENTIONS.md §4: specs are
// current-state only), and that acceptance-criteria sections reference
// packages with a test suite where applicable (per CONVENTIONS.md §4.1,
// warnings), and that every top-level docs/*.spec.md is named in the
// current-placements paragraph of CONVENTIONS.md §1.1.
//
// Zero runtime dependencies — pure Node fs + path. Picks up new specs and
// subpackage docs automatically (no hardcoded spec list); the package
// name→directory map is computed from pkg/*/package.json at run time.
//
// See docs/CONVENTIONS.md for the governance model this enforces.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const pkgDir = join(root, 'pkg');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

// The spec corpus: every docs/**/*.md file, plus every colocated
// pkg/<pkg>/README.spec.md and in-package suite pkg/<pkg>/docs/**/*.md
// (CONVENTIONS.md §1.1).
async function specFiles() {
  const files = await walk(docsDir);
  let packages = [];
  try {
    packages = await readdir(pkgDir);
  } catch {
    // No pkg/ directory — corpus only.
  }
  for (const name of packages) {
    for (const rel of ['README.spec.md', 'docs']) {
      const candidate = join(pkgDir, name, rel);
      try {
        const s = await stat(candidate);
        if (s.isFile()) files.push(candidate);
        else if (s.isDirectory()) files.push(...await walk(candidate));
      } catch {
        // No spec at this placement.
      }
    }
  }
  return files;
}

// Extract relative markdown links: [text](path) or [text](path#anchor)
const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;

function extractLinks(content) {
  const links = [];
  let m;
  while ((m = linkRe.exec(content)) !== null) {
    const raw = m[2];
    // Strip anchor and query from the path part
    const path = raw.split('#')[0].split('?')[0];
    // Anchor, if any (query stripped). A bare trailing "#" is an empty
    // anchor — it claims nothing, so the anchor check skips it.
    const anchor = raw.includes('#') ? raw.split('#')[1].split('?')[0] : '';
    // Only check relative links (skip http, mailto, absolute paths)
    if (!path || /^(https?:|mailto:|tel:|#)/.test(path) || path.startsWith('/')) continue;
    if (!path.endsWith('.md')) continue;
    links.push({ raw, path, anchor });
  }
  return links;
}

// GitHub-compatible heading slug: lowercase; strip every character that is
// not a letter, number, underscore, space, or hyphen (underscores kept, as
// github-slugger keeps them — code identifiers in headings survive); then
// each single space becomes one hyphen. Spaces are not collapsed, so
// "7. `inclusive` / `excludes` conventions" slugs to
// "7-inclusive--excludes-conventions" (the stripped "/" leaves two).
function githubSlug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');
}

// ATX heading texts (line-initial #), skipping fenced code blocks.
// Emphasis/backtick markers are dropped — they render away — while
// underscores are kept (githubSlug keeps "_").
function extractHeadings(content) {
  const headings = [];
  let inFence = false;
  let fenceMarker = '';
  for (const line of content.split('\n')) {
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fence[1].startsWith(fenceMarker)) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) headings.push(m[1].replace(/[*`]/g, '').trim());
  }
  return headings;
}

// Memoized set of valid anchors for a target file. Duplicate heading texts
// get "-1", "-2", … suffixes from the second occurrence on, as on GitHub.
const anchorCache = new Map();
async function anchorSlugs(target) {
  if (!anchorCache.has(target)) {
    const content = await readFile(target, 'utf8');
    const seen = new Map();
    const slugs = new Set();
    for (const text of extractHeadings(content)) {
      const base = githubSlug(text);
      const nth = seen.get(base) || 0;
      seen.set(base, nth + 1);
      slugs.add(nth === 0 ? base : `${base}-${nth}`);
    }
    anchorCache.set(target, slugs);
  }
  return anchorCache.get(target);
}

// The §1.1 "Current placements:" paragraph of docs/CONVENTIONS.md — the
// lead-in line through the next blank line, joined into one string.
async function currentPlacementsParagraph() {
  const content = await readFile(join(docsDir, 'CONVENTIONS.md'), 'utf8');
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.startsWith('Current placements:'));
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.trim() === '');
  return lines.slice(start, end === -1 ? lines.length : end).join(' ');
}

// Top-level corpus specs: docs/*.spec.md files (the corpus shape of
// CONVENTIONS.md §1.1 — suite directories and non-spec docs excluded).
async function corpusSpecBasenames() {
  const basenames = [];
  let entries = [];
  try {
    entries = await readdir(docsDir);
  } catch {
    return basenames; // No docs/ directory.
  }
  for (const name of entries) {
    if (!name.endsWith('.spec.md')) continue;
    try {
      const s = await stat(join(docsDir, name));
      if (s.isFile()) basenames.push(name);
    } catch {
      // Unstatable entry — skip.
    }
  }
  return basenames;
}

// Transition-prose patterns (CONVENTIONS.md §4: specs are current-state only).
// These are warnings, not errors — stylistic, not structural.
//
// Matches: "Recent change" blocks, "previously/prior to" transition narrative,
// "this revision" framing, bare spec-version scope markers ("in v2"),
// old "What changed in version" framing, and stale spec-version cross-claims
// ("schema v5", "spec.spec.md v3").
//
// Excludes: product-scope markers ("out of scope for v1", "metanorma-standoc ≥ v1.4.1"),
// the "for v1" scope qualifier, and the ≥ version qualifier.
const transitionPatterns = [
  { re: /\*\*Recent change/i, label: 'Recent change block' },
  { re: /\bWhat changed in version/i, label: 'old changelog framing' },
  { re: /\bthis revision\b/i, label: '"this revision" framing' },
  { re: /\b(previously|prior to)\b/i, label: 'transition narrative', exclude: /out of scope/i },
  {
    re: /\bin v[1-9]\b/i,
    label: 'spec-version scope marker',
    exclude: /out of scope|for v1|in v1|≥ v/i,
  },
  {
    re: /(?:schema|editor|toolbar|prosemirror|commands|relaton)\.spec\.md\s+v\d/i,
    label: 'stale spec-version cross-claim',
  },
  {
    re: /(?:schema|editor|toolbar)\s+v\d/i,
    label: 'stale spec-version cross-claim',
    exclude: /out of scope|metanorma-standoc|≥ v/i,
  },
];

const headerVersionRe = /\*\*Spec version:\*\*\s*\d/i;
const headerDepsRe = /\*\*Spec dependencies:\*\*\s*\[/i;

// Acceptance-criteria section heading, at any level (e.g. "## 13. Acceptance
// criteria", "### 1.12 Acceptance criteria").
const acceptanceHeadingRe = /^#{1,6}\s+.*acceptance criteria/i;
const headingRe = /^(#{1,6})\s/;

// Package references inside an acceptance section, both forms:
// - `pkg/<dir>/` with trailing slash. Load-bearing: bare `pkg/<dir>` mentions
//   without a slash are deliberately NOT matched — e.g. ProseMirrorMinimap
//   §15's closing note mentions `pkg/editor-gui` bare as a consumer aside,
//   and bare-path matching would falsely warn on it.
// - `@metanorma/<name>` mentions (incl. `yarn workspace @metanorma/<name>`).
//   Required for robustness: schema.spec.md §14 and EditorCommands.spec.md
//   §1.12 reference their package only by name, never by path.
const pkgPathRefRe = /pkg\/([a-z0-9-]+)\//g;
const pkgNameRefRe = /@metanorma\/([a-z0-9-]+)/g;

// Workspace name → pkg/ directory and pkg dir → has-test-script, computed
// from pkg/*/package.json at run time (no hardcoded map). Note: `editor-gui`'s
// workspace name is bare (no @metanorma/ scope), so name-form references to
// it don't resolve — acceptable, since it is a consumer app, not a
// spec-governed package.
async function packageMaps() {
  const nameToDir = new Map(); // '@metanorma/<name>' → pkg dir
  const dirHasTest = new Map(); // pkg dir → has test script
  let packages = [];
  try {
    packages = await readdir(pkgDir);
  } catch {
    return { nameToDir, dirHasTest }; // No pkg/ directory — corpus only.
  }
  for (const name of packages) {
    try {
      const s = await stat(join(pkgDir, name));
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    let hasTest = false;
    let pkgName = null;
    try {
      const pkg = JSON.parse(await readFile(join(pkgDir, name, 'package.json'), 'utf8'));
      pkgName = pkg.name || null;
      hasTest = Boolean(pkg.scripts && pkg.scripts.test);
    } catch {
      // Unreadable/absent manifest — treat as no tests.
    }
    if (pkgName) nameToDir.set(pkgName, name);
    dirHasTest.set(name, hasTest);
  }
  return { nameToDir, dirHasTest };
}

// Slice out the body of an acceptance-criteria section: heading line → next
// heading of same-or-higher level (subsections included — Minimap §15.1–15.3
// are ### under ##).
function acceptanceSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let current = null; // { level, from }
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]);
    if (m) {
      if (current && m[1].length <= current.level) {
        sections.push(lines.slice(current.from, i).join('\n'));
        current = null;
      }
      if (acceptanceHeadingRe.test(lines[i])) {
        current = { level: m[1].length, from: i };
      }
    }
  }
  if (current) sections.push(lines.slice(current.from).join('\n'));
  return sections;
}

// Package directories referenced by an acceptance section (both ref forms),
// resolved through the name→dir map.
function acceptancePackageRefs(section, nameToDir) {
  const refs = new Set();
  let m;
  while ((m = pkgPathRefRe.exec(section)) !== null) refs.add(m[1]);
  while ((m = pkgNameRefRe.exec(section)) !== null) {
    const dir = nameToDir.get(`@metanorma/${m[1]}`);
    if (dir) refs.add(dir);
  }
  return refs;
}

let failed = false;
const errors = [];
const warnings = [];

async function main() {
  const files = await specFiles();
  const { nameToDir, dirHasTest } = await packageMaps();

  for (const file of files) {
    const relPath = relative(root, file);
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');

    // Check 1: Link integrity — the path resolves to a file, and a named
    // anchor matches a heading slug in that target (CONVENTIONS.md §3).
    const links = extractLinks(content);
    for (const link of links) {
      const target = resolve(dirname(file), link.path);
      let targetIsFile = false;
      try {
        const s = await stat(target);
        if (!s.isFile()) {
          errors.push(`${relPath}: link target not a file: ${link.raw}`);
        } else {
          targetIsFile = true;
        }
      } catch {
        errors.push(`${relPath}: broken link: ${link.raw}`);
      }
      if (targetIsFile && link.anchor) {
        const slugs = await anchorSlugs(target);
        if (!slugs.has(link.anchor)) {
          errors.push(
            `${relPath}: broken anchor: no heading "${link.anchor}" in ` +
              `${relative(root, target)}: ${link.raw}`,
          );
        }
      }
    }

    // Check 2: Header hygiene — no **Spec version:** or **Spec dependencies:** lines
    lines.forEach((line, i) => {
      if (headerVersionRe.test(line)) {
        errors.push(`${relPath}:${i + 1}: found removed "**Spec version:**" header — see docs/CONVENTIONS.md §2`);
      }
      if (headerDepsRe.test(line)) {
        errors.push(`${relPath}:${i + 1}: found removed "**Spec dependencies:**" header — see docs/CONVENTIONS.md §2`);
      }
    });

    // Skip governance docs for the prose checks (they document the patterns
    // and mention packages legitimately; they are not specs governing a
    // package).
    if (relPath === 'docs/CONVENTIONS.md' || relPath === 'docs/CHANGELOG.md') continue;

    // Check 3: Transition-prose warnings (CONVENTIONS.md §4)
    lines.forEach((line, i) => {
      for (const { re, label, exclude } of transitionPatterns) {
        if (exclude && exclude.test(line)) continue;
        if (re.test(line)) {
          warnings.push(`${relPath}:${i + 1}: ${label}: ${line.trim().slice(0, 120)}`);
        }
      }
    });

    // Check 4: Acceptance-criteria coverage warnings (CONVENTIONS.md §4.1).
    // An acceptance-criteria section that references a package lacking a
    // test script warns — the criteria are contractual (§4.1), so a spec
    // governing an untested package is incomplete. Warning-tier, like
    // check 3: never fails CI. Sections with no package references are
    // skipped silently.
    for (const section of acceptanceSections(content)) {
      const refs = acceptancePackageRefs(section, nameToDir);
      if (refs.size === 0) continue;
      const untested = [...refs].filter((dir) => dirHasTest.get(dir) === false);
      if (untested.length > 0) {
        warnings.push(
          `${relPath}: acceptance criteria reference package(s) without a test script: ` +
            `${untested.map((d) => `pkg/${d}`).join(', ')} — see docs/CONVENTIONS.md §4.1`,
        );
      }
    }
  }

  // Check 5: Placements guard — every top-level docs/*.spec.md is named in
  // the §1.1 current-placements paragraph of CONVENTIONS.md. Containment is
  // checked against that paragraph alone: a spec basename may legitimately
  // appear elsewhere in CONVENTIONS.md (e.g. §4.1's test-naming examples),
  // which would make whole-file containment vacuous for exactly the drift
  // this guard exists to catch. Error-tier: an unnamed corpus spec is
  // invisible to the placement list readers navigate by.
  const placements = await currentPlacementsParagraph();
  if (placements === null) {
    errors.push('docs/CONVENTIONS.md: no "Current placements:" paragraph (see CONVENTIONS.md §1.1)');
  } else {
    for (const basename of await corpusSpecBasenames()) {
      if (!placements.includes(basename)) {
        errors.push(`docs/CONVENTIONS.md: corpus spec not listed in §1.1 placements: ${basename}`);
      }
    }
  }

  // Report
  if (warnings.length > 0) {
    console.log('⚠ Spec check warnings (transition prose per §4, acceptance-criteria coverage per §4.1):\n');
    for (const w of warnings) console.log(`  ${w}`);
    console.log('');
  }

  if (errors.length > 0) {
    console.error('✗ Spec check failed:\n');
    for (const e of errors) console.error(`  ${e}`);
    console.error('');
    console.error(`  ${errors.length} error(s). Fix above or see docs/CONVENTIONS.md.`);
    process.exit(1);
  }

  console.log(`✓ Spec check passed (${files.length} spec files checked, ${warnings.length} warning(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
