#!/usr/bin/env node
/**
 * extract-css.mjs — extract the library-scope CSS from the mock into
 * panel-layout.css, verbatim. Companion to extract-design-tokens.mjs;
 * run together via tokens:extract (the --check flag applies to both).
 *
 * Grab-anchoring rule: every grab is anchored to verbatim rule text — a
 * unique prefix plus, where a block spans lines, a terminal literal from
 * the rule's LAST declaration. Never anchor a lazy gap at a bare `\n  }`:
 * a rule that ends inline (last declaration closes with `)}` or similar)
 * makes the lazy match run to the NEXT block's closing brace. That
 * overshoot is how the gripHover grab once dragged the mock's importmap
 * JSON and ~170 lines of demo panel-content CSS into the artifact while
 * tokens:check stayed green (both directions derive from the same regex —
 * self-consistent but wrong). The FORBIDDEN sanity guard below is the
 * retroactive catcher for that class of defect.
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
// Float window radius (overflow stays visible so the 4px resize handles
// protrude 2px and stay hittable) — grab includes its rationale comment.
const withTitlebar = grab(
  /  \/\* the floating window itself[\s\S]*?\n  \}/);
const tbBase = grab(/  \.layoutArea \.dv-floating-titlebar\{[\s\S]*?\n  \}/);
const tbActive = grab(/  \.layoutArea \.dv-floating-titlebar:active\{cursor:grabbing\}/);
const gripBase = grab(/  \.mn-drag-grip\{[\s\S]*?\n  \}/);
// The grip-hover rule ends INLINE (`...3px 7px)}`): anchor the tail
// verbatim, or the lazy gap swallows everything up to the next `\n  }`.
const gripHover = grab(
  /  \.layoutArea \.dv-floating-titlebar:hover \.mn-drag-grip,\n  \.layoutArea \.dv-floating-titlebar:active \.mn-drag-grip\{opacity:1;background:repeating-linear-gradient\(90deg,\n    #8a99a8 0 3px, transparent 3px 7px\)\}/);
// Tab strip + tabs + the STOCK grid-sash hover accent (J5's grid surface).
const tabsSashes = grab(
  /  \/\* tab strip \+ tabs \+ sashes \*\/\n[\s\S]*?dv-enabled\.dv-active-sash\{background:var\(--accent\)\}/);
// The takeover + suppression grabs start at their explanatory comments so
// the artifact keeps the mock's reasoning for both behaviors.
const sash = grab(
  /  \/\* Per-tabset-height takeover[\s\S]*?\.dv-sash-container > \.dv-sash\{cursor:ns-resize[\s\S]*?dv-active-sash\{background:var\(--accent\)\}/);
const unwrapHover = grab(
  /  \/\* drop-zone suppression while[\s\S]*?\.dv-resize-container \.dv-drop-target-container\{display:block !important\}/);
// J7 reduced motion (behavior.spec.md §3 J7 — the task-10 convergence
// amendment): var-zeroing block for the J4 zone fades + J5 sash accent,
// anchored to its comment and the media query's terminal declaration.
const reducedMotion = grab(
  /  \/\* J7 reduced motion[\s\S]*?--dv-active-sash-transition-delay: 0s\}\n  \}/);

const out = `/*
 * panel-layout.css — library chrome styles, extracted verbatim from the
 * mock. Regenerate + drift-check:
 *   yarn workspace @metanorma/panel-layout tokens:extract [--check]
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * (see mock/design-tokens.json _provenance for the commit)
 *
 * Sections: design tokens (:root), dockview theme overrides, float window
 * radius, float titlebar cursor + drag-grip chrome, tab strip + sashes,
 * sash cursor takeover (per-tabset-height model), drop-zone suppression
 * while an unwrap claim is live, reduced-motion var zeroing (J7). Panel
 * content styles stay in the demo (panel bodies are consumer-owned). Every
 * selector except :root and .mn-drag-grip is .layoutArea-scoped: the layout
 * container must carry that class for this chrome to apply.
 */

${root}

${dv}

${withTitlebar}

${tbBase}
${tbActive}

${gripBase}
${gripHover}

${tabsSashes}
${sash}

${unwrapHover}

${reducedMotion}
`;

/* Sanity guard on the artifact, independent of the grab regexes: the
   output must be library chrome only. An overshooting grab leaks HTML
   tags, importmap JSON, mock JS and demo panel-content/app-chrome rules
   (the failure this guard was introduced for — tokens:check cannot see it
   alone, being regex-derived from the same mock in both directions). */
const FORBIDDEN = [
  [/<\/?(style|script|html|body)\b/i, 'an HTML tag'],
  [/"imports"\s*:/, 'importmap JSON'],
  [/^\s*(import|const|function)\s/m, 'mock JS source'],
  [/\.panelwrap\b|\.o-node\b|\.bib-row\b|\.bib-item\b|\.pfilter\b/,
    'a demo panel-content selector'],
  [/\.toolbar\b|\.statusbar\b|#boot\b|\.tb-btn\b/,
    'a demo app-chrome selector'],
  [/\.page\b|\.doc-title\b|\.req\b|\.mk\b|\.badge\b/,
    'a demo document-page selector'],
];
for (const [re, what] of FORBIDDEN) {
  if (re.test(out)) {
    console.error('extract-css sanity check failed: output contains '
      + what + ' (' + re.toString() + ') — a grab regex overshot its rule');
    process.exit(1);
  }
}

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
