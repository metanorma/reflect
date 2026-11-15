/**
 * `FootnotePicker` — the footnote insertion / removal control
 * (reference-marks.md §4, §5.5, §7).
 *
 * A dedicated React component (`FootnoteButton`) owns the picker dialog state.
 * Click behaviour:
 *
 * - **Marker selected (`NodeSelection` on `footnote_marker`)**: toggle-off —
 *   removes the marker via `removeFootnoteMarker` (never touches the entry).
 * - **No entries exist**: creates a new footnote immediately (generated id +
 *   placeholder entry) — no confirmation dialog.
 * - **Entries exist**: opens a picker dialog offering reuse of an existing entry
 *   or creation of a new one.
 * - **`onFootnotePrompt` hook provided**: delegates to the hook (host picker).
 *
 * The `FootnoteEntryPicker` dialog lists existing `footnote_entry` nodes with
 * their auto-computed ordinal and a text preview, plus a "Create new" action.
 * It is a shell on the base popover/dialog layer (MetanormaToolbar.spec.md
 * §10.10): a `react-aria-components` `Popover` + `Dialog` anchored to the
 * trigger and rendered in a portal at `<body>` (top layer — escaping all
 * ancestor overflow clipping). The existing list markup was moved into the
 * `Dialog` as-is rather than rebuilt on RAC `ListBox`, so the shared
 * `.mn-toolbar-popover__list/__item/__actions` utilities (and their e2e
 * locators) are preserved unchanged. Focus opens on the first entry item and
 * returns to the trigger on close.
 */

import React, { useEffect, useRef, useState } from "react";
import { Popover, Dialog } from "react-aria-components";
import type { RefObject } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { NodeSelection } from "prosemirror-state";
import type { Node } from "prosemirror-model";

import {
  insertFootnoteMarker,
  removeFootnoteMarker,
  generateId,
} from "@metanorma/editor-commands";

import type { RefPromptContext } from "./AdvancedMetanormaToolbar.js";
import { toolbarButtonClass } from "./ToolbarButtonView.js";

import "./reference-marks.css";

/** DOM id of the picker dialog — the trigger's `aria-controls` target. */
const POPOVER_ID = "mn-footnote-picker-dialog";

// ---------------------------------------------------------------------------
// State-derived helpers
// ---------------------------------------------------------------------------

/** A flattened view of a `footnote_entry` node for the picker. */
interface FootnoteEntryInfo {
  readonly id: string;
  readonly number: number;
  readonly preview: string;
}

/** Whether the current selection is a `NodeSelection` on a `footnote_marker`. */
function isOnFootnoteMarker(state: EditorState): boolean {
  return (
    state.selection instanceof NodeSelection &&
    state.selection.node.type.name === "footnote_marker"
  );
}

/** Whether the selection is inside inline content (enabled predicate). */
function isInlineCtx(state: EditorState): boolean {
  return state.selection.$from.parent.type.inlineContent;
}

/**
 * Count `footnote_entry` nodes in the document. Used as a `useEditorStateSelector`
 * snapshot — returns a primitive number (referentially stable for
 * `useSyncExternalStore`).
 */
function entryCount(state: EditorState): number {
  let count = 0;
  state.doc.descendants((node: Node) => {
    if (node.type.name === "footnote_entry") {
      count += 1;
    }
    return true;
  });
  return count;
}

/**
 * Collect all `footnote_entry` nodes in document order, each with its
 * auto-computed ordinal (the index of the first `footnote_marker` whose
 * `target` matches the entry's `id`). Called at click time (not as a selector
 * snapshot) to avoid returning a fresh array from `useEditorStateSelector`.
 */
function collectEntries(state: EditorState): FootnoteEntryInfo[] {
  // First pass: collect entries with their ids and text preview.
  const rawEntries: { id: string; preview: string }[] = [];
  state.doc.descendants((node: Node) => {
    if (node.type.name === "footnote_entry") {
      const id = node.attrs["id"] as string | null;
      if (id !== null) {
        const preview = node.textBetween(0, node.content.size, " ").trim();
        rawEntries.push({ id, preview });
      }
    }
    return true;
  });

  // Build a marker-ordinal lookup (target id → first ordinal).
  const ordinalMap = new Map<string, number>();
  let ordinal = 0;
  state.doc.descendants((node: Node) => {
    if (node.type.name === "footnote_marker") {
      ordinal += 1;
      const target = node.attrs["target"] as string | null;
      if (target !== null && !ordinalMap.has(target)) {
        ordinalMap.set(target, ordinal);
      }
    }
    return true;
  });

  // Assign the ordinal from the marker lookup; entries with no referencing
  // marker get a fallback sequential number after the last marker ordinal.
  let fallback = ordinal;
  return rawEntries.map((e) => ({
    id: e.id,
    number: ordinalMap.get(e.id) ?? (++fallback),
    preview: e.preview,
  }));
}

/** Build a {@link RefPromptContext} from the given editor state. */
function buildFootnoteContext(state: EditorState): RefPromptContext {
  const selectedText = !state.selection.empty
    ? state.doc.textBetween(state.selection.from, state.selection.to, " ")
    : null;
  return { state, currentValue: null, selectedText };
}

// ---------------------------------------------------------------------------
// Picker dialog
// ---------------------------------------------------------------------------

/**
 * The footnote-entry picker popover (reference-marks.md §5.5) — the RAC shell
 * of MetanormaToolbar.spec.md §10.10 with the existing list markup inside
 * (kept as-is to preserve the shared `.mn-toolbar-popover__*` utilities).
 */
export function FootnoteEntryPicker({
  isOpen,
  onOpenChange,
  triggerRef,
  entries,
  onPick,
  onCreateNew,
  onCancel,
}: {
  /** Whether the popover is open (controlled). */
  readonly isOpen: boolean;
  /** Called when the popover should close (Escape, click-outside). */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Ref of the trigger button — RAC positions the popover relative to it. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly entries: readonly FootnoteEntryInfo[];
  readonly onPick: (id: string) => void;
  readonly onCreateNew: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);

  // Open-focus lands on the first entry item (§10.10) — RAC's default
  // open-focus is the dialog container, so move it onward explicitly.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Escape/outside are handled by the RAC shell (§10.10): onOpenChange(false)
  // is the cancel path, with focus returned to the trigger.
  const handleOpenChange = (open: boolean): void => {
    if (!open) onCancel();
    onOpenChange(open);
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      triggerRef={triggerRef}
      offset={4}
      className="mn-footnote-picker"
    >
      <Dialog id={POPOVER_ID} aria-label="Insert footnote">
        <div ref={contentRef}>
          <ul className="mn-toolbar-popover__list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="mn-toolbar-popover__item"
                  onClick={() => onPick(entry.id)}
                >
                  <strong>[{entry.number}]</strong>{" "}
                  {entry.preview !== "" ? entry.preview : "(empty)"}
                </button>
              </li>
            ))}
          </ul>
          <div className="mn-toolbar-popover__actions">
            <button
              type="button"
              className="mn-toolbar-popover__item"
              onClick={onCreateNew}
            >
              + Create new
            </button>
            <button
              type="button"
              className="mn-toolbar-popover__item"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </Dialog>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Trigger button + state orchestrator
// ---------------------------------------------------------------------------

/**
 * The "Footnote" trigger button + picker (reference-marks.md §4, §5.5).
 *
 * Owns the picker's controlled open state and delegates to the pure
 * `insertFootnoteMarker` / `removeFootnoteMarker` commands via
 * `useEditorEventCallback`. The trigger's `aria-expanded`/`aria-controls`
 * reflect the open state (wired explicitly per base §10.10).
 */
export function FootnoteButton({
  onFootnotePrompt,
}: {
  readonly onFootnotePrompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
}): React.JSX.Element {
  const [pickerEntries, setPickerEntries] = useState<readonly FootnoteEntryInfo[]>([]);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Selectors return primitives (boolean / number) — referentially stable for
  // useSyncExternalStore.
  const isMarkerSelected = useEditorStateSelector(isOnFootnoteMarker);
  const enabled = useEditorStateSelector(isInlineCtx);
  const count = useEditorStateSelector(entryCount);

  const removeMarker = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    removeFootnoteMarker(view.state, view.dispatch);
    view.focus();
  });

  const createNew = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    insertFootnoteMarker(view.state, view.dispatch, generateId());
    view.focus();
  });

  const reuseEntry = useEditorEventCallback(
    (view: EditorView | null, id: string) => {
      if (view === null) return;
      insertFootnoteMarker(view.state, view.dispatch, id);
      view.focus();
    },
  );

  // Hook path: build the context from view.state, capture state/dispatch
  // synchronously before the async await (stale-view guard).
  const viaHook = useEditorEventCallback(async (view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const ctx = buildFootnoteContext(state);
    const result = await onFootnotePrompt?.(ctx);
    if (result === null || result === undefined) {
      view.focus();
      return;
    }
    insertFootnoteMarker(state, dispatch, result);
    view.focus();
  });

  // Read entries synchronously at click time (NOT during render — the fresh
  // array would break useSyncExternalStore). Returns the entries so the caller
  // can setState directly in the click handler, following the InsertTableButton
  // pattern (useEditorEventCallback for reads/dispatch only, never setState).
  const fetchEntries = useEditorEventCallback(
    (view: EditorView | null): readonly FootnoteEntryInfo[] => {
      if (view === null) return [];
      return collectEntries(view.state);
    },
  );

  const closePicker = (): void => {
    setOpen(false);
  };

  const handleClick = (): void => {
    // Toggle-off: if a marker is selected, remove it.
    if (isMarkerSelected) {
      void removeMarker();
      return;
    }

    // If a host hook is provided, delegate to it.
    if (onFootnotePrompt !== undefined) {
      void viaHook();
      return;
    }

    // No hook: if no entries exist, create immediately without a dialog.
    if (count === 0) {
      void createNew();
      return;
    }

    // Entries exist: collect them at click time and open the picker. The
    // popover mounts on the next render with the entries already committed.
    const entries = fetchEntries();
    setPickerEntries(entries);
    setOpen(true);
  };

  return (
    <div className="mn-toolbar-footnote">
      <button
        ref={triggerRef}
        type="button"
        className={toolbarButtonClass(isMarkerSelected, enabled)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? POPOVER_ID : undefined}
        disabled={!enabled}
        title="Insert footnote"
        onClick={handleClick}
      >
        Footnote
      </button>
      <FootnoteEntryPicker
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        entries={pickerEntries}
        onPick={(id) => {
          closePicker();
          void reuseEntry(id);
        }}
        onCreateNew={() => {
          closePicker();
          void createNew();
        }}
        onCancel={closePicker}
      />
    </div>
  );
}
