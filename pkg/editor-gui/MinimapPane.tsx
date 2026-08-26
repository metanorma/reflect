/**
 * `<MinimapPane>` — editor-gui host for the document minimap.
 *
 * A consumer-local component (NOT part of `@metanorma/prosemirror-editor` or
 * `@metanorma/toolbar`): placement is a consumer concern
 * (ProseMirrorMinimap.spec.md §11 — "placement is fully external").
 *
 * Rendered as a child of `MetanormaProseMirror`, i.e. inside the
 * `@handlewithcare/react-prosemirror` context. There is no context hook that
 * hands the `EditorView` to a rendering component, so the view is captured
 * from `useEditorEffect` — the one hook whose callback receives the view —
 * into local state on mount (the layout effect fires after the view is
 * created and re-fires with the same view reference thereafter, so a single
 * guarded assignment suffices; spec §11).
 *
 * The plugin side is installed in `App.tsx` (`editorPlugins`); this
 * component only attaches the renderer, so the pane stays mounted (and the
 * layout stable) while the view arrives.
 */

import React, { useState } from 'react';
import { useEditorEffect } from '@metanorma/prosemirror-editor';
import { Minimap } from '@metanorma/prosemirror-minimap';
import type {
  MinimapOptions,
  MinimapTheme,
  MinimapView,
} from '@metanorma/prosemirror-minimap';
import classNames from './style.module.css';

/** DOM id on the editor viewport (`.ProseMirror`) — the overlay's
 * `aria-controls` target (spec §9.1). */
const EDITOR_VIEWPORT_ID = 'mn-editor-viewport';

/**
 * Component-owned theme (spec §7.1 plugin-wins rule): `App.tsx`'s plugin
 * options deliberately set only `classifier`, so every key here — notably
 * `theme` — takes effect. Extends the neutral defaults with the Metanorma
 * `formula` class and maps row colors onto the editor token palette
 * (pkg/prosemirror-editor/tokens.css).
 *
 * Indent semantics: a class with `indent: true` shifts its rows by
 * `depth × indentUnit` (2px/step). A section's title and body blocks are
 * SAME-DEPTH siblings in the block tree (the clause container itself is
 * transparent to the walk), so indenting every row-rendered class — text
 * AND the block-content classes — puts a section's body in exact lockstep
 * with its title. Content inside nested containers (note, example, dl)
 * lands one depth deeper than the surrounding body by tree structure;
 * the depth-0 `bibdata` strip stays flush.
 *
 * Glyph semantics: only `heading` opts into per-character glyph blitting
 * (tier 1) — section/floating titles are the package's own recommended
 * use (short, LTR, Latin-only content; the glyph path's known defects —
 * CJK clipping, no bidi reordering — don't apply there). Body text and the
 * block classes stay on the default filled-rectangle path: bars read
 * better at paragraph scale and dodge the glyph defects entirely.
 */
const minimapOptions: MinimapOptions = {
  display: 'sliding',
  theme: {
    background: 'transparent',
    classes: {
      text: { color: '#8888a0', indent: true },
      heading: { color: '#c8c8dc', indent: true },
      figure: { color: '#b08ad0', indent: true },
      table: { color: '#80a8c8', indent: true },
      code: { color: '#70b070', indent: true },
      formula: { color: '#c0a860', indent: true },
    },
    selection: { color: '#77aaff', alpha: 0.3 },
  } satisfies Partial<MinimapTheme>,
};

/**
 * The minimap pane. `React.memo`: the view reference is stable for the
 * editor's lifetime, so the pane does not re-render on App state changes
 * (status line, editor state) — the canvas repaints through the controller,
 * not React.
 */
export const MinimapPane = React.memo(function MinimapPane() {
  const [view, setView] = useState<MinimapView | null>(null);

  useEditorEffect((v) => {
    // The real EditorView satisfies the structural `MinimapView` seam at
    // runtime; the nominal prosemirror-view 1.42.0/1.42.1 dual-instance
    // mismatch in this repo's PnP graph is bridged here, once (same
    // pattern as the minimap package's own plugin.ts).
    const minimapView = v as unknown as MinimapView;
    // `aria-controls` target for the overlay (§9.1) — stable id on the
    // scroll container itself.
    if (v.dom.id === '') {
      v.dom.id = EDITOR_VIEWPORT_ID;
    }
    setView((prev) => (prev === minimapView ? prev : minimapView));
  }, []);

  // NOTE: `useEditorEffect` is imported via `@metanorma/prosemirror-editor`
  // (which re-exports it), NOT via a direct
  // `@handlewithcare/react-prosemirror` dependency — under Yarn PnP the
  // direct dependency resolves to a second virtual instance whose
  // `EditorContext` differs from the one the editor provides, crashing the
  // pane with "Cannot destructure property 'view' of null".

  return (
    <div className={classNames.minimapPane}>
      {view !== null && (
        <Minimap
          view={view}
          options={minimapOptions}
          editorViewportId={EDITOR_VIEWPORT_ID}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
});
