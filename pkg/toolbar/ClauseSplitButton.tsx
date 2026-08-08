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
 * - **Leading paragraph** → calls `insertLeadingParagraph` (adds intro text
 *   before subclauses).
 *
 * Uses the HTML Popover API (`popover="manual"`) + CSS Anchor Positioning,
 * same as the other toolbar pickers.
 */

import React, { useRef } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import {
  wrapInClause,
  canWrapInClause,
  insertClauseAfter,
  insertLeadingParagraph,
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

/** Whether a leading paragraph can be inserted (inside any section). */
function canInsertLeadingPara(state: EditorState): boolean {
  return nearestSectionAncestor(state.selection.$from) !== null;
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
  onLeadingPara,
  canNested,
  canSibling,
  canLeading,
  onCancel,
  ref,
}: {
  readonly onNested: () => void;
  readonly onSibling: () => void;
  readonly onLeadingPara: () => void;
  readonly canNested: boolean;
  readonly canSibling: boolean;
  readonly canLeading: boolean;
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
      popover="manual"
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
      <button
        type="button"
        role="menuitem"
        className="mn-clause-menu__item"
        disabled={!canLeading}
        onClick={onLeadingPara}
      >
        Leading paragraph
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split-button trigger
// ---------------------------------------------------------------------------

/** Resolve heading title from the prompt, then dispatch a clause command. */
function resolveTitle(
  getHeadingPrompt: () => () => Promise<string | null>,
  cb: (opts: { readonly title: string | null }) => void,
): void {
  void getHeadingPrompt()().then((title) => {
    const opts = title === null
      ? { title: null }
      : { title: title === "" ? null : title };
    cb(opts);
  });
}

/**
 * The "Clause" split button (sections.md §4.2). Owns the heading prompt flow,
 * the dropdown open state, and the context-sensitive primary action.
 */
export function ClauseSplitButton({
  getHeadingPrompt,
}: {
  readonly getHeadingPrompt: () => () => Promise<string | null>;
}): React.JSX.Element {
  const enabled = useEditorStateSelector(canInsertClause);
  const siblingEnabled = useEditorStateSelector(canInsertSibling);
  const leadingEnabled = useEditorStateSelector(canInsertLeadingPara);
  const primaryTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Context-sensitive primary click: reads live view state at click time to
  // decide nested vs sibling. State/dispatch captured synchronously before the
  // async prompt (stale-view guard).
  const primaryClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const isSibling = isInEmptyTrailingParagraph(state);
    resolveTitle(getHeadingPrompt, (opts) => {
      if (isSibling) {
        insertClauseAfter(state, dispatch, opts);
      } else {
        wrapInClause(state, dispatch, opts);
      }
      view.focus();
    });
  });

  // Dropdown: explicit nested clause.
  const nestedClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    resolveTitle(getHeadingPrompt, (opts) => {
      wrapInClause(state, dispatch, opts);
      view.focus();
    });
  });

  // Dropdown: explicit sibling clause.
  const siblingClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    resolveTitle(getHeadingPrompt, (opts) => {
      insertClauseAfter(state, dispatch, opts);
      view.focus();
    });
  });

  // Dropdown: leading paragraph (no heading prompt needed).
  const leadingParaClick = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    insertLeadingParagraph(view.state, view.dispatch);
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
        canLeading={leadingEnabled}
        onNested={() => {
          closeMenu();
          void nestedClick();
        }}
        onSibling={() => {
          closeMenu();
          void siblingClick();
        }}
        onLeadingPara={() => {
          closeMenu();
          void leadingParaClick();
        }}
        onCancel={closeMenu}
      />
    </div>
  );
}
