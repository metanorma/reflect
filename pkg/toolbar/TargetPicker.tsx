/**
 * `TargetPicker` — doc-anchored target picker for `xref` and `concept`
 * (reference-marks.md §5.1, §5.3).
 *
 * The default (no `onXrefPrompt` / `onConceptPrompt` hook) UI for resolving a
 * document-internal reference target. A popover lists the id-bearing nodes
 * already present in the document (sections, containers, `floating_title`,
 * `figure`, `table`, `formula`, `footnote_entry`, `footnote_marker`), each
 * shown with a readable label and its id. The same input doubles as a
 * free-text entry field: pressing Enter with no highlighted list item commits
 * the typed text verbatim — the spec's Tier-2 free-text path (forward
 * references to anchors not yet in the doc) folded into the picker.
 *
 * Uses the HTML Popover API (`popover="manual"`) with CSS Anchor Positioning
 * so the popover renders in the browser's **top layer** — escaping all
 * ancestor overflow clipping regardless of toolbar/layout CSS. Same pattern as
 * the footnote/table/image popovers.
 */

import React, { useRef, useState } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import type { Node } from "prosemirror-model";

import { toggleXref, toggleConcept } from "@metanorma/editor-commands";

import type { RefPromptContext } from "./AdvancedMetanormaToolbar.js";
import { isInlineContext } from "./predicates.js";

import "./reference-marks.css";

// ---------------------------------------------------------------------------
// State-derived helpers
// ---------------------------------------------------------------------------

/** A flattened view of an id-bearing node for the picker. */
export interface TargetInfo {
  readonly id: string;
  readonly label: string;
  readonly type: string;
}

/**
 * The node types whose `id` attr marks them as cross-reference targets
 * (reference-marks.md §5.1). All 10 section types + the 3 containers +
 * `floating_title`, `figure`, `table`, `formula`, `footnote_entry`,
 * `footnote_marker`.
 */
const TARGET_TYPES: ReadonlySet<string> = new Set([
  // SECTION_TYPES (10)
  "clause", "annex", "content_section", "abstract", "foreword",
  "introduction", "acknowledgements", "terms", "definitions", "references",
  // containers (structural, id-bearing via baseAttrs)
  "preface", "sections", "bibliography",
  // id-bearing block / inline atoms
  "floating_title", "figure", "table", "formula",
  "footnote_entry", "footnote_marker",
]);

/** Capitalize a type name for a fallback label (e.g. "clause" → "Clause"). */
function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build a readable label for an id-bearing node (reference-marks.md §5.1):
 * the `title` attr if non-empty, else the first ~60 chars of node text, else
 * the capitalized type name.
 */
function labelFor(node: Node): string {
  const title = node.attrs["title"];
  if (typeof title === "string" && title.length > 0) return title;
  if (node.content.size > 0) {
    const text = node.textBetween(0, node.content.size, " ").trim();
    if (text !== "") return text.length > 60 ? text.slice(0, 60) + "…" : text;
  }
  return capitalize(node.type.name);
}

/**
 * Collect all id-bearing target nodes in document order
 * (reference-marks.md §5.1). Called at click time (NOT as a selector
 * snapshot) to avoid returning a fresh array from `useEditorStateSelector`.
 */
export function collectTargets(state: EditorState): readonly TargetInfo[] {
  const out: TargetInfo[] = [];
  state.doc.descendants((node: Node) => {
    if (TARGET_TYPES.has(node.type.name)) {
      const id = node.attrs["id"];
      if (typeof id === "string" && id !== "") {
        out.push({ id, label: labelFor(node), type: node.type.name });
      }
    }
    return true;
  });
  return out;
}

/** Whether a named mark is active at the current selection. */
function refMarkActive(state: EditorState, name: string): boolean {
  const mark = state.schema.marks[name];
  if (mark === undefined) return false;
  const marks = state.selection.empty
    ? (state.storedMarks ?? state.selection.$from.marks())
    : state.selection.$to.marks();
  return mark.isInSet(marks) !== undefined;
}

/** Build a {@link RefPromptContext} from the given editor state + mark name. */
function buildRefContext(state: EditorState, name: string): RefPromptContext {
  const mark = state.schema.marks[name];
  let currentValue: string | null = null;
  if (mark !== undefined) {
    const marks = state.selection.empty
      ? (state.storedMarks ?? state.selection.$from.marks())
      : state.selection.$to.marks();
    const active = mark.isInSet(marks);
    if (active !== undefined) {
      const v = active.attrs["target"] ?? active.attrs["cite"] ?? active.attrs["ref"] ?? active.attrs["type"];
      currentValue = typeof v === "string" ? v : null;
    }
  }
  const selectedText =
    !state.selection.empty
      ? state.doc.textBetween(state.selection.from, state.selection.to, " ")
      : null;
  return { state, currentValue, selectedText };
}

// ---------------------------------------------------------------------------
// Picker popover (presentational)
// ---------------------------------------------------------------------------

/**
 * The doc-anchored target picker popover (reference-marks.md §5.1, §5.3).
 *
 * Renders a search/filter `<input>` and a `<ul>` of candidate targets. The
 * input doubles as free-text manual entry: Enter with no highlighted list item
 * commits the typed text as-is (Tier-2 forward-reference path). ArrowUp/Down
 * navigates the filtered list; Enter on a highlighted item picks its `id`;
 * Escape cancels.
 *
 * `popover="manual"`: top-layer rendering, no light-dismiss (close is handled
 * via pick / Cancel / Escape). The CSS class `mn-target-picker` is
 * self-contained — it does NOT use the shared `.mn-toolbar-popover` base class
 * because the consumer's vertical-toolbar override targets `.mn-toolbar-popover`
 * with `right: 100%`, which would conflict with anchor positioning.
 */
export function TargetPicker({
  targets,
  onPick,
  onCancel,
  ref,
  anchorClass,
  ariaLabel,
}: {
  readonly targets: readonly TargetInfo[];
  readonly onPick: (id: string) => void;
  readonly onCancel: () => void;
  readonly ref?: React.Ref<HTMLDivElement> | undefined;
  /** Per-button modifier class binding the popover to its trigger's anchor. */
  readonly anchorClass: "mn-target-picker--xref" | "mn-target-picker--concept";
  readonly ariaLabel: string;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = targets.filter(
    (t) =>
      t.label.toLowerCase().includes(query.toLowerCase()) ||
      t.id.toLowerCase().includes(query.toLowerCase()),
  );

  // Keep highlight in range as the filter changes.
  const safeHighlight = filtered.length === 0 ? 0 : Math.min(highlight, filtered.length - 1);

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (filtered.length > 0) setHighlight((h) => Math.min(filtered.length - 1, h + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (filtered.length > 0) setHighlight((h) => Math.max(0, h - 1));
        break;
      case "Enter": {
        e.preventDefault();
        if (filtered.length > 0 && safeHighlight < filtered.length) {
          onPick(filtered[safeHighlight]!.id);
        } else if (query !== "") {
          // No list item highlighted: commit the typed text as a free-text id
          // (Tier-2 forward-reference path).
          onPick(query);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        onCancel();
        break;
    }
  };

  // Auto-focus the search input when the popover opens.
  const setInputRef = (el: HTMLInputElement | null): void => {
    searchRef.current = el;
    el?.focus();
  };

  return (
    <div
      popover="manual"
      className={`mn-target-picker ${anchorClass}`}
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="false"
      ref={ref}
      onKeyDown={handleKey}
    >
      <input
        ref={setInputRef}
        type="text"
        className="mn-target-picker__search"
        placeholder="Filter targets or type an id…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
      />
      <ul className="mn-toolbar-popover__list">
        {filtered.map((t, i) => (
          <li key={t.id}>
            <button
              type="button"
              className={
                i === safeHighlight
                  ? "mn-toolbar-popover__item mn-target-picker__item--active"
                  : "mn-toolbar-popover__item"
              }
              data-id={t.id}
              data-type={t.type}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => onPick(t.id)}
            >
              <span className="mn-target-picker__label">{t.label}</span>{" "}
              <code className="mn-target-picker__id">{t.id}</code>
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="mn-target-picker__empty">
            {query === "" ? "No targets in document." : "No matches — press Enter to use the typed id."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared trigger-button + state orchestrator
// ---------------------------------------------------------------------------

/**
 * Internal orchestrator for the Xref / Concept trigger buttons. Mirrors
 * `FootnoteButton`: owns the picker open state, anchors the popover to the
 * trigger, and delegates to a pure mark command via `useEditorEventCallback`.
 *
 * @param markName  `"xref"` or `"concept"` — drives active detection + command.
 * @param markLabel Trigger button visible label ("Xref" / "Concept").
 * @param markTitle Trigger button ARIA title.
 * @param anchorClass Per-button anchor modifier on the popover.
 * @param onPickCommand  Dispatch the pure command with the resolved target.
 * @param onHook   Optional host hook (delegated to when present).
 */
function TargetButton({
  markName,
  markLabel,
  markTitle,
  anchorClass,
  ariaLabel,
  onHook,
  dispatchPick,
}: {
  readonly markName: "xref" | "concept";
  readonly markLabel: string;
  readonly markTitle: string;
  readonly anchorClass: "mn-target-picker--xref" | "mn-target-picker--concept";
  readonly ariaLabel: string;
  readonly onHook?:
    | ((context: RefPromptContext) => Promise<string | null>)
    | ((context: RefPromptContext) => Promise<{ ref: string; kind: "eref" | "xref" | "termref" } | null>)
    | undefined;
  /** Apply the resolved target id via the pure command. */
  readonly dispatchPick: (
    state: EditorState,
    dispatch: (tr: import("prosemirror-state").Transaction) => void,
    target: string,
  ) => void;
}): React.JSX.Element {
  const [targets, setTargets] = useState<readonly TargetInfo[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isActive = useEditorStateSelector((s) => refMarkActive(s, markName));
  const enabled = useEditorStateSelector(isInlineContext);

  // Toggle-off: remove the mark with a null target.
  const toggleOff = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    if (markName === "xref") {
      toggleXref(state, dispatch, null);
    } else {
      toggleConcept(state, dispatch, null);
    }
    view.focus();
  });

  // Picker path: apply the mark with the picked target id.
  const pickTarget = useEditorEventCallback((view: EditorView | null, target: string) => {
    if (view === null) return;
    dispatchPick(view.state, view.dispatch, target);
    view.focus();
  });

  // Hook path: build the context from view.state, capture state/dispatch
  // synchronously before the async await (stale-view guard, project memory).
  const viaHook = useEditorEventCallback(async (view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const ctx = buildRefContext(state, markName);
    const result = await onHook?.(ctx);
    if (result === null || result === undefined) {
      view.focus();
      return;
    }
    // xref hook → string; concept hook → { ref, kind }. The picker path always
    // uses the default kind ("xref"), so only the ref string is extracted here.
    const target = typeof result === "string" ? result : result.ref;
    dispatchPick(state, dispatch, target);
    view.focus();
  });

  // Read targets synchronously at click time (NOT during render — the fresh
  // array would break useSyncExternalStore). Returns the targets so the caller
  // can setState directly in the click handler (FootnoteButton pattern).
  const fetchTargets = useEditorEventCallback(
    (view: EditorView | null): readonly TargetInfo[] => {
      if (view === null) return [];
      return collectTargets(view.state);
    },
  );

  const closePicker = (): void => {
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  const handleClick = (): void => {
    // Toggle-off: if the mark is active, remove it.
    if (isActive) {
      void toggleOff();
      return;
    }

    // If a host hook is provided, delegate to it.
    if (onHook !== undefined) {
      void viaHook();
      return;
    }

    // No hook: collect targets at click time and open the picker.
    const collected = fetchTargets();
    setTargets(collected);
    // showPopover must be called after React commits the updated targets into
    // the DOM. requestAnimationFrame defers to the next paint.
    requestAnimationFrame(() => popoverRef.current?.showPopover());
  };

  return (
    <div className={markName === "xref" ? "mn-toolbar-xref" : "mn-toolbar-concept"}>
      <button
        ref={triggerRef}
        type="button"
        className={
          isActive
            ? "mn-toolbar-btn mn-toolbar-btn--active"
            : "mn-toolbar-btn"
        }
        aria-haspopup="dialog"
        disabled={!enabled}
        title={markTitle}
        onClick={handleClick}
      >
        {markLabel}
      </button>
      <TargetPicker
        ref={popoverRef}
        targets={targets}
        anchorClass={anchorClass}
        ariaLabel={ariaLabel}
        onPick={(id) => {
          closePicker();
          void pickTarget(id);
        }}
        onCancel={closePicker}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public trigger buttons
// ---------------------------------------------------------------------------

/**
 * The "Xref" trigger button + doc-anchored picker (reference-marks.md §5.1).
 * Owns the picker open state and delegates to the pure `toggleXref` command via
 * `useEditorEventCallback`. When `onXrefPrompt` is provided the picker is
 * bypassed and the host hook resolves the target instead.
 */
export function XrefButton({
  onXrefPrompt,
}: {
  readonly onXrefPrompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
}): React.JSX.Element {
  return (
    <TargetButton
      markName="xref"
      markLabel="Xref"
      markTitle="Insert cross-reference"
      anchorClass="mn-target-picker--xref"
      ariaLabel="Cross-reference target"
      onHook={onXrefPrompt}
      dispatchPick={(state, dispatch, target) => {
        toggleXref(state, dispatch, target);
      }}
    />
  );
}

/**
 * The "Concept" trigger button + doc-anchored picker (reference-marks.md §5.3).
 * The picker path uses `kind: "xref"` (the spec default for document-internal
 * concept references). When `onConceptPrompt` is provided the picker is
 * bypassed and the host hook resolves `{ ref, kind }` instead.
 */
export function ConceptButton({
  onConceptPrompt,
}: {
  readonly onConceptPrompt?:
    | ((context: RefPromptContext) => Promise<{ ref: string; kind: "eref" | "xref" | "termref" } | null>)
    | undefined;
}): React.JSX.Element {
  return (
    <TargetButton
      markName="concept"
      markLabel="Concept"
      markTitle="Insert concept reference"
      anchorClass="mn-target-picker--concept"
      ariaLabel="Concept reference target"
      onHook={onConceptPrompt}
      dispatchPick={(state, dispatch, target) => {
        toggleConcept(state, dispatch, target, "xref");
      }}
    />
  );
}
