#!/usr/bin/env node

// Spec reverse-dependency report.
//
// Given a spec file path, prints every other doc under docs/ that links to it.
// Use this to find which specs to review when you change one.
//
// Usage:
//   node scripts/spec-impact.mjs docs/schema.spec.md
//   yarn spec-impact docs/EditorCommands.spec.md
//
// Zero runtime dependencies — pure Node fs + path. Picks up new specs and
// subpackage docs automatically (no hardcoded spec list).
//
// See docs/CONVENTIONS.md §6.

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/spec-impact.mjs <docs/path-to-spec.md>');
  console.error('Example: node scripts/spec-impact.mjs docs/schema.spec.md');
  process.exit(1);
}

// Normalize the target to an absolute path
const targetAbs = resolve(root, target);

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

const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;

async function main() {
  const files = await walk(docsDir);
  const referrers = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      const raw = m[2];
      const linkPath = raw.split('#')[0].split('?')[0];
      if (!linkPath || /^(https?:|mailto:|tel:|#)/.test(linkPath)) continue;
      if (!linkPath.endsWith('.md')) continue;

      const resolved = resolve(dirname(file), linkPath);
      if (resolved === targetAbs) {
        const rel = relative(root, file);
        if (!referrers.includes(rel)) referrers.push(rel);
      }
    }
  }

  const targetRel = relative(root, targetAbs);
  console.log(`Referenced by (${referrers.length}):`);
  if (referrers.length === 0) {
    console.log('  (no docs link to this spec)');
  } else {
    for (const r of referrers.sort()) console.log(`  ${r}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
