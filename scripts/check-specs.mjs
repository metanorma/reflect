#!/usr/bin/env node

// Spec cross-reference integrity checker.
//
// Validates that every relative markdown link in the spec files — docs/**/*.md
// plus every colocated pkg/<pkg>/README.spec.md and in-package suite
// pkg/<pkg>/docs/**/*.md (placements per CONVENTIONS.md §1.1) — resolves to
// an existing file, that no spec carries
// the removed **Spec version:** / **Spec dependencies:** header lines, that
// specs are free of transition prose (per CONVENTIONS.md §4: specs are
// current-state only), and that acceptance-criteria sections reference
// packages with a test suite where applicable (per CONVENTIONS.md §4.1,
// warnings).
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
    // Strip anchor and query
    const path = raw.split('#')[0].split('?')[0];
    // Only check relative links (skip http, mailto, absolute paths)
    if (!path || /^(https?:|mailto:|tel:|#)/.test(path) || path.startsWith('/')) continue;
    if (!path.endsWith('.md')) continue;
    links.push({ raw, path });
  }
  return links;
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

    // Check 1: Link integrity
    const links = extractLinks(content);
    for (const link of links) {
      const target = resolve(dirname(file), link.path);
      try {
        const s = await stat(target);
        if (!s.isFile()) {
          errors.push(`${relPath}: link target not a file: ${link.raw}`);
        }
      } catch {
        errors.push(`${relPath}: broken link: ${link.raw}`);
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
