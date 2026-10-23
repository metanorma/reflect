#!/usr/bin/env node
/**
 * extract-css.mjs — extract the library-scope CSS from the mock into
 * panel-layout.css, verbatim. Companion to extract-design-tokens.mjs;
 * run together via tokens:extract (the --check flag applies to both).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mock = readFileSync(
  join(here, 'mock', 'editor-dockview7-floats.html'), 'utf8');
const check = process.argv.includes('--check');

const grab = (re) => {
  const m = mock.match(re);
  if (!m) {
    throw new Error('css extract failed: ' + re.toString().slice(0, 60));
  }
  return m[0];
};

const root = grab(/  :root\{[\s\S]*?\n  \}/);
const dv = grab(/  \.layoutArea \.dockview-theme-light\{[\s\S]*?\n  \}/);
const tbBase = grab(/  \.layoutArea \.dv-floating-titlebar\{[\s\S]*?\n  \}/);
const tbActive = grab(/  \.layoutArea \.dv-floating-titlebar:active\{cursor:grabbing\}/);
const gripBase = grab(/  \.mn-drag-grip\{[\s\S]*?\n  \}/);
const gripHover = grab(
  /  \.layoutArea \.dv-floating-titlebar:hover \.mn-drag-grip,[\s\S]*?\n  \}/);
const sash = grab(
  /  \.layoutArea \.dv-resize-container \.dv-split-view-container > \.dv-sash-container > \.dv-sash\{cursor:ns-resize[\s\S]*?dv-active-sash\{background:var\(--accent\)\}/);
const unwrapHover = grab(
  /  \.layoutArea\.mn-unwrap-hover \.dv-drop-target-selection,[\s\S]*?\.dv-resize-container \.dv-drop-target-container\{display:block !important\}/);

const out = `/*
 * panel-layout.css — library chrome styles, extracted verbatim from the
 * mock. Regenerate + drift-check:
 *   yarn workspace @metanorma/panel-layout tokens:extract [--check]
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * (see mock/design-tokens.json _provenance for the commit)
 *
 * Sections: design tokens (:root), dockview theme overrides, float titlebar
 * cursor + drag-grip chrome, sash cursor takeover (per-tabset-height
 * model), drop-zone suppression while an unwrap claim is live.
 * Panel-content styles stay in the demo (panel bodies are consumer-owned).
 */

${root}

${dv}

${tbBase}
${tbActive}

${gripBase}
${gripHover}

${sash}

${unwrapHover}
`;

const target = join(here, 'panel-layout.css');
if (check) {
  const current = readFileSync(target, 'utf8');
  if (current !== out) {
    console.error('panel-layout.css is stale — regenerate with '
      + 'yarn workspace @metanorma/panel-layout tokens:extract');
    process.exit(1);
  }
  console.log('panel-layout.css up to date');
} else {
  writeFileSync(target, out);
  console.log('wrote ' + target + ' (' + out.length + ' bytes)');
}
