#!/usr/bin/env node

// Spec cross-reference integrity checker.
//
// Validates that every relative markdown link in the spec files — docs/**/*.md
// plus every colocated pkg/<pkg>/README.spec.md (placement per
// CONVENTIONS.md §1.1) — resolves to an existing file, that no spec carries
// the removed **Spec version:** / **Spec dependencies:** header lines, and
// that specs are free of transition prose (per CONVENTIONS.md §4: specs are
// current-state only).
//
// Zero runtime dependencies — pure Node fs + path. Picks up new specs and
// subpackage docs automatically (no hardcoded spec list).
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
// pkg/<pkg>/README.spec.md (CONVENTIONS.md §1.1).
async function specFiles() {
  const files = await walk(docsDir);
  let packages = [];
  try {
    packages = await readdir(pkgDir);
  } catch {
    // No pkg/ directory — corpus only.
  }
  for (const name of packages) {
    const candidate = join(pkgDir, name, 'README.spec.md');
    try {
      const s = await stat(candidate);
      if (s.isFile()) files.push(candidate);
    } catch {
      // Package has no colocated spec.
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

let failed = false;
const errors = [];
const warnings = [];

async function main() {
  const files = await specFiles();

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

    // Check 3: Transition-prose warnings (CONVENTIONS.md §4)
    // Skip governance docs (they document the patterns legitimately)
    if (relPath === 'docs/CONVENTIONS.md' || relPath === 'docs/CHANGELOG.md') continue;
    lines.forEach((line, i) => {
      for (const { re, label, exclude } of transitionPatterns) {
        if (exclude && exclude.test(line)) continue;
        if (re.test(line)) {
          warnings.push(`${relPath}:${i + 1}: ${label}: ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }

  // Report
  if (warnings.length > 0) {
    console.log('⚠ Transition-prose warnings (move to CHANGELOG or rewrite as current-state):\n');
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
