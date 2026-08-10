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
 * It uses the HTML Popover API (`popover="auto"`) with CSS Anchor Positioning
 * so it renders in the browser's **top layer** — escaping all ancestor overflow
 * clipping regardless of toolbar/layout CSS.
 */

import React, { useRef, useState } from "react";

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

import "./reference-marks.css";

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
 * The footnote-entry picker popover (reference-marks.md §5.5).
 *
 * Lists existing entries for reuse, plus a "Create new" action. Uses the HTML
 * Popover API (`popover="auto"`) so the element renders in the browser's top
 * layer — above all other content, regardless of ancestor overflow clipping.
 * CSS Anchor Positioning (`anchor-name` / `position-anchor`) ties the popover
 * to the trigger button without JavaScript positioning math.
 */
export function FootnoteEntryPicker({
  entries,
  onPick,
  onCreateNew,
  onCancel,
  ref,
}: {
  readonly entries: readonly FootnoteEntryInfo[];
  readonly onPick: (id: string) => void;
  readonly onCreateNew: () => void;
  readonly onCancel: () => void;
  readonly ref?: React.Ref<HTMLDivElement> | undefined;
}): React.JSX.Element {
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    // `popover="auto"`: top-layer rendering with light-dismiss (outside click,
    // Escape, and auto-close when another popover opens).
    // The CSS class `mn-footnote-picker` is self-contained — it does NOT use
    // the shared `.mn-toolbar-popover` base class because the consumer's
    // vertical-toolbar override (style.module.css) targets `.mn-toolbar-popover`
    // with `right: 100%`, which would conflict with anchor positioning.
    <div
      popover="auto"
      className="mn-footnote-picker"
      ref={ref}
      onKeyDown={handleKey}
    >
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
  );
}

// ---------------------------------------------------------------------------
// Trigger button + state orchestrator
// ---------------------------------------------------------------------------

/**
 * The "Footnote" trigger button + picker (reference-marks.md §4, §5.5).
 *
 * Owns the picker's open state and delegates to the pure `insertFootnoteMarker`
 * / `removeFootnoteMarker` commands via `useEditorEventCallback`.
 */
export function FootnoteButton({
  onFootnotePrompt,
}: {
  readonly onFootnotePrompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
}): React.JSX.Element {
  const [pickerEntries, setPickerEntries] = useState<readonly FootnoteEntryInfo[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
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

    // Entries exist: collect them at click time and open the picker.
    const entries = fetchEntries();
    setPickerEntries(entries);
    // showPopover must be called after React commits the updated entries
    // into the DOM. requestAnimationFrame defers to the next paint.
    requestAnimationFrame(() => popoverRef.current?.showPopover());
  };

  return (
    <div className="mn-toolbar-footnote">
      <button
        ref={triggerRef}
        type="button"
        className={
          isMarkerSelected
            ? "mn-toolbar-btn mn-toolbar-btn--active"
            : "mn-toolbar-btn"
        }
        aria-haspopup="dialog"
        disabled={!enabled}
        title="Insert footnote"
        onClick={handleClick}
      >
        Footnote
      </button>
      <FootnoteEntryPicker
        ref={popoverRef}
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
