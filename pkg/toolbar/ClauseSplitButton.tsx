/**
 * `ClauseSplitButton` — split-button for clause insertion (sections.md §4.2).
 *
 * A primary button ("Clause") with a context-sensitive action, plus a caret
 * button that opens a dropdown popover with explicit choices.
 *
 * **Primary click — context-sensitive:**
 * - If the cursor is in an **empty trailing paragraph** of the nearest section,
 *   inserts a **sibling** clause after the current section (`insertClauseAfter`).
 *   The empty paragraph is left in place as the current clause's trailing
 *   content.
 * - Otherwise, wraps the current block in a **nested** clause (`wrapInClause`).
 *
 * **Dropdown menu:**
 * - **Nested clause** → always calls `wrapInClause` (forces nesting).
 * - **Sibling clause** → always calls `insertClauseAfter` (forces sibling).
 *
 * Both `wrapInClause` and `insertClauseAfter` create the clause with an empty
 * `section_title` child and place the cursor there — the user types the heading
 * and applies marks directly in the document. No prompt dialog is needed.
 *
 * Uses the HTML Popover API (`popover="auto"`) + CSS Anchor Positioning for
 * the dropdown menu, same as the other toolbar pickers.
 */

import React, { useRef } from "react";
import type { EditorState } from "prosemirror-state";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import {
  wrapInClause,
  canWrapInClause,
  insertClauseAfter,
  nearestSectionAncestor,
} from "@metanorma/editor-commands";

import "./clause-split-button.css";

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** Whether the cursor is in an empty trailing paragraph of the nearest section. */
function isInEmptyTrailingParagraph(state: EditorState): boolean {
  const { $from } = state.selection;
  const para = $from.parent;
  if (!para.isTextblock || para.content.size !== 0) return false;
  const hit = nearestSectionAncestor($from);
  if (hit === null) return false;
  return $from.end($from.depth) === $from.end(hit.depth);
}

/** Whether either nested or sibling clause insertion is possible. */
function canInsertClause(state: EditorState): boolean {
  return canWrapInClause(state) || insertClauseAfter(state, undefined);
}

/** Whether sibling clause insertion is possible. */
function canInsertSibling(state: EditorState): boolean {
  return insertClauseAfter(state, undefined);
}

// ---------------------------------------------------------------------------
// Dropdown popover
// ---------------------------------------------------------------------------

/**
 * The clause insertion dropdown menu popover.
 */
export function ClauseDropdownMenu({
  onNested,
  onSibling,
  canNested,
  canSibling,
  onCancel,
  ref,
}: {
  readonly onNested: () => void;
  readonly onSibling: () => void;
  readonly canNested: boolean;
  readonly canSibling: boolean;
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
    <div
      popover="auto"
      className="mn-clause-menu"
      role="menu"
      aria-label="Insert clause"
      ref={ref}
      onKeyDown={handleKey}
    >
      <button
        type="button"
        role="menuitem"
        className="mn-clause-menu__item"
        disabled={!canNested}
        onClick={onNested}
      >
        Nested clause
      </button>
      <button
        type="button"
        role="menuitem"
        className="mn-clause-menu__item"
        disabled={!canSibling}
        onClick={onSibling}
      >
        Sibling clause
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split-button trigger
// ---------------------------------------------------------------------------

/**
 * The "Clause" split button (sections.md §4.2). Synchronous — no prompt dialog.
 * The primary click dispatches `wrapInClause` or `insertClauseAfter` (based on
 * context), and the cursor lands in the new clause's empty `section_title`.
 */
export function ClauseSplitButton(): React.JSX.Element {
  const enabled = useEditorStateSelector(canInsertClause);
  const siblingEnabled = useEditorStateSelector(canInsertSibling);
  const primaryTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const primaryClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    if (isInEmptyTrailingParagraph(view.state)) {
      insertClauseAfter(view.state, view.dispatch);
    } else {
      wrapInClause(view.state, view.dispatch);
    }
    view.focus();
  });

  const nestedClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    wrapInClause(view.state, view.dispatch);
    view.focus();
  });

  const siblingClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    insertClauseAfter(view.state, view.dispatch);
    view.focus();
  });

  const closeMenu = (): void => {
    menuRef.current?.hidePopover();
    primaryTriggerRef.current?.focus();
  };

  return (
    <div className="mn-toolbar-clause-split">
      <button
        ref={primaryTriggerRef}
        type="button"
        className="mn-toolbar-btn"
        disabled={!enabled}
        title="Insert clause (context-sensitive)"
        onClick={() => void primaryClick()}
      >
        Clause
      </button>
      <button
        type="button"
        className="mn-toolbar-btn mn-clause-split-caret"
        disabled={!enabled}
        title="Clause options…"
        aria-haspopup="menu"
        aria-label="Clause options"
        onClick={() => menuRef.current?.togglePopover()}
      >
        ▾
      </button>
      <ClauseDropdownMenu
        ref={menuRef}
        canNested={enabled}
        canSibling={siblingEnabled}
        onNested={() => { closeMenu(); void nestedClick(); }}
        onSibling={() => { closeMenu(); void siblingClick(); }}
        onCancel={closeMenu}
      />
    </div>
  );
}
