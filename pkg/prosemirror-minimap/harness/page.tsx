/**
 * The harness page (§15.3): a plain `EditorView` on the synthetic schema
 * plus the `<Minimap>` renderer, exposed to Playwright through a small
 * page-global API.
 *
 * Deliberately NOT the consumer stack: no `@handlewithcare/react-prosemirror`,
 * no Metanorma schema/packages — a plain ProseMirror view keeps the harness's
 * dependency surface at exactly the package's own peers (§15.3).
 *
 * Test surface (page-global, plain JS objects):
 *
 * - `window.__mnMount({ doc, options, scrollShape })` — unmount any previous
 *   instance, then create a view + pane from the given JSON doc and
 *   `MinimapOptions`. Options flow verbatim to BOTH `createMinimap()` and
 *   `<Minimap options>` (plugin wins on overlap — §11), so each test pins
 *   its own zoom/display/theme instead of inheriting a consumer's.
 * - `window.__mnUnmount()` — teardown (view.destroy + React unmount).
 * - `window.__mnLoadDoc(json)` — remount with the same config and a new doc
 *   (exercises the teardown/attach path; the in-place state-swap path is
 *   consumer wiring, covered in editor-gui).
 * - `window.__mnReady(): Promise<void>` — resolves after the first paint.
 *
 * `scrollShape` selects the DOM skeleton (§7.1 scroll-container contract):
 *
 * - `editor-scrolls`           — `.ProseMirror` itself scrolls (the
 *                                editor-gui shape).
 * - `wrapper-scrolls`          — an outer wrapper div scrolls; the default
 *                                walk-up must find it.
 * - `wrapper-scrolls-explicit` — same DOM, but the page injects an
 *                                `options.scrollContainer` resolver (skips
 *                                the walk).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';

import { createMinimap, Minimap } from '../index.js';
import type { MinimapClassifier, MinimapOptions, MinimapView } from '../types.js';
import { docFromJson } from './schema.js';

/** DOM id on the editor viewport — the overlay's `aria-controls` (§9.1). */
const EDITOR_VIEWPORT_ID = 'mn-harness-viewport';

/**
 * Named classifier factories the page can inject. `page.evaluate` only
 * carries structured-cloneable data, so tests select a classifier by NAME
 * (`options.classifier: 'glyphs'`); the page maps the name to the real
 * factory (§15.3).
 */
const CLASSIFIERS: Record<string, MinimapClassifier> = {
  /** Default: every textblock → `text` (the package default). */
  default: { row: (node) => (node.isTextblock ? { classId: 'text' } : null) },
  /** Heading-class routing: `heading` nodes → the glyph-enabled class,
   * other textblocks → `text` (the §5.1/§5.4 consumer contract). */
  glyphs: {
    row: (node) => {
      if (node.type.name === 'heading') return { classId: 'heading' };
      if (node.isTextblock) return { classId: 'text' };
      return null;
    },
  },
};

export type ScrollShape =
  | 'editor-scrolls'
  | 'wrapper-scrolls'
  | 'wrapper-scrolls-explicit';

export interface MountSpec {
  doc: unknown;
  options?: Omit<MinimapOptions, 'classifier'> & { classifier?: string };
  scrollShape?: ScrollShape;
}

let appEl: HTMLElement | null = null;
let view: EditorView | null = null;
let root: Root | null = null;
let lastSpec: MountSpec | null = null;
let readyPromise: Promise<void> = Promise.resolve();

/** Arm the ready promise: two rAFs — attach happens in the React effect,
 * paint lands the following frame. */
function armReady(): void {
  readyPromise = new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function unmount(): void {
  if (root !== null) {
    root.unmount();
    root = null;
  }
  if (view !== null) {
    view.destroy();
    view = null;
  }
  if (appEl !== null) {
    appEl.replaceChildren();
  }
}

function mount(spec: MountSpec): void {
  unmount();
  lastSpec = spec;
  if (appEl === null) {
    throw new Error('harness not initialised');
  }

  const shape: ScrollShape = spec.scrollShape ?? 'editor-scrolls';
  const { classifier: classifierName, ...rest } = spec.options ?? {};
  const options: MinimapOptions = { ...rest };
  if (classifierName !== undefined) {
    const classifier = CLASSIFIERS[classifierName];
    if (classifier === undefined) {
      throw new Error(`unknown classifier '${classifierName}'`);
    }
    options.classifier = classifier;
  }

  // ── DOM skeleton per scroll shape (§7.1) ────────────────────────────
  const app = document.createElement('div');
  app.className = 'mn-harness-app';

  const editorHost = document.createElement('div');
  let scrollWrapper: HTMLElement;
  if (shape === 'editor-scrolls') {
    // `.ProseMirror` itself scrolls (the editor-gui shape).
    editorHost.className = 'mn-harness-editor mn-harness-editor-scrolls';
    scrollWrapper = editorHost;
    app.appendChild(editorHost);
  } else {
    // An outer wrapper scrolls; the walk-up (or the explicit resolver)
    // must find it.
    editorHost.className = 'mn-harness-editor';
    scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'mn-harness-scrollwrapper';
    scrollWrapper.appendChild(editorHost);
    app.appendChild(scrollWrapper);
    if (shape === 'wrapper-scrolls-explicit') {
      options.scrollContainer = () => scrollWrapper;
    }
  }

  const pane = document.createElement('div');
  pane.className = 'mn-harness-pane';
  app.appendChild(pane);
  appEl.appendChild(app);

  // ── Plain ProseMirror view + plugin, React only for <Minimap> ──────
  const state = EditorState.create({
    doc: docFromJson(spec.doc),
    // baseKeymap so Enter splits paragraphs and typing behaves like an
    // editor (the typing regressions need real editing); the minimap
    // plugin rides alongside.
    plugins: [createMinimap(options), keymap(baseKeymap)],
  });
  // A fresh EditorState carries a TextSelection at doc start; the
  // minimap's selection layer paints it full-width, which would pollute
  // pixel-analysis tests — so ink-analysis themes set a TRANSPARENT
  // selection color and the tests need not fight the tint. Blur too (a
  // focused editable keeps painting its caret selection). Tests that
  // exercise selection-driven behavior focus the editor themselves.
  view = new EditorView(editorHost, { state });
  view.dom.id = EDITOR_VIEWPORT_ID;
  view.dom.blur();

  armReady();
  root = createRoot(pane);
  root.render(
    React.createElement(Minimap, {
      view: view as unknown as MinimapView,
      options,
      editorViewportId: EDITOR_VIEWPORT_ID,
      style: { width: '100%', height: '100%' },
    }),
  );
}

/**
 * Wire the page-global test hooks onto `window`. Returns the same hooks
 * (for direct use by `bootstrap.tsx`).
 */
export function initHarness(w: Window): void {
  appEl = document.createElement('div');
  appEl.id = 'mn-harness-root';
  w.document.body.appendChild(appEl);

  Object.assign(w, {
    __mnMount: (spec: MountSpec) => mount(spec),
    __mnUnmount: () => unmount(),
    __mnLoadDoc: (json: unknown) => {
      if (lastSpec === null) {
        throw new Error('__mnLoadDoc before __mnMount');
      }
      mount({ ...lastSpec, doc: json });
    },
    __mnReady: () => readyPromise,
  });
}
