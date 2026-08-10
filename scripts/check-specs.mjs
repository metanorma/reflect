#!/usr/bin/env node

// Spec cross-reference integrity checker.
//
// Validates that every relative markdown link in docs/**/*.md resolves to an
// existing file, that no spec carries the removed **Spec version:** /
// **Spec dependencies:** header lines, and that body text is free of stale
// spec-version cross-claims (e.g. "schema v5", "MetanormaToolbar.spec.md v3").
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

// Patterns that look like spec-version cross-claims.
// Conservative: matches "schema v<N>", "<specname>.spec.md v<N>", "the base spec's v<N>",
// "spec version <N>". Avoids false positives on product-scope "out of scope for v1".
const specVersionRe = /(?:schema|editor|toolbar|prosemirror|commands|relaton|spec)\.spec\.md\s+v\d/i
  .source
  + '|' + /(?:schema|editor|toolbar)\s+v\d/i.source
  + '|' + /spec version\s+\d/i.source;

const versionClaimRe = new RegExp(specVersionRe, 'i');

const headerVersionRe = /\*\*Spec version:\*\*\s*\d/i;
const headerDepsRe = /\*\*Spec dependencies:\*\*\s*\[/i;

let failed = false;
const errors = [];
const warnings = [];

async function main() {
  const files = await walk(docsDir);

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

    // Check 3: Stale spec-version cross-claims in body text
    // Skip CONVENTIONS.md itself (it documents the examples)
    if (relPath === 'docs/CONVENTIONS.md') continue;
    lines.forEach((line, i) => {
      // Skip product-scope markers like "Out of scope (v1)"
      if (/out of scope/i.test(line)) return;
      if (versionClaimRe.test(line)) {
        warnings.push(`${relPath}:${i + 1}: possible stale spec-version reference: ${line.trim().slice(0, 120)}`);
      }
    });
  }

  // Report
  if (warnings.length > 0) {
    console.log('⚠ Spec-version reference warnings (review and remove if stale):\n');
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

  console.log(`✓ Spec check passed (${files.length} docs checked, ${warnings.length} warning(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
