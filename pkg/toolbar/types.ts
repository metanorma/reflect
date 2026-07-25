/**
 * Shared toolbar types (§10.2–10.4, §10.7).
 *
 * Consumed by both `MetanormaToolbar` (base) and `AdvancedMetanormaToolbar`,
 * which live in the same `@metanorma/toolbar` package.
 */

import type { ReactNode } from "react";

import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

// ---------------------------------------------------------------------------
// §10.2 Entry model
// ---------------------------------------------------------------------------

/**
 * Button descriptor (§5). `isActive` / `isEnabled` are pure functions of
 * {@link EditorState}; `run` dispatches against an {@link EditorView}.
 */
export interface ToolbarButton {
  /** Unique key for React list rendering. */
  readonly key: string;
  /** Human-readable label shown as button text. */
  readonly label: string;
  /** ARIA title for the `<button>` element. */
  readonly title: string;
  /** Whether this button applies to the current selection. */
  readonly isActive: (state: EditorState) => boolean;
  /** Whether this button can execute against the current selection. */
  readonly isEnabled: (state: EditorState) => boolean;
  /** Dispatch the command via the `EditorView`. */
  readonly run: (view: EditorView) => void;
}

/** A plain data-driven button (marks, lists, link, …). */
export interface ToolbarButtonEntry {
  readonly kind: "button";
  readonly descriptor: ToolbarButton;
}

/**
 * A stateful control rendered in place of a button
 * (table grid picker, image dialog, reference-mark popover).
 * The component owns its own hooks and popover/dialog state.
 */
export interface ToolbarControlEntry {
  readonly kind: "control";
  readonly render: () => ReactNode;
}

export type ToolbarEntry = ToolbarButtonEntry | ToolbarControlEntry;

// ---------------------------------------------------------------------------
// §10.3 Group definition
// ---------------------------------------------------------------------------

/** One visually grouped cluster of entries, separated by dividers. */
export interface ToolbarGroupDef {
  /** Stable id used for `visibleGroups` toggling and React keys. */
  readonly id: string;
  /** Accessible label for the group container (`aria-label`). */
  readonly label: string;
  readonly entries: readonly ToolbarEntry[];
}

// ---------------------------------------------------------------------------
// §10.4 The shared `<Toolbar>` shell
// ---------------------------------------------------------------------------

export interface ToolbarProps {
  /** Ordered group definitions to render, left-to-right. */
  readonly groups: readonly ToolbarGroupDef[];
  /** Hide entire groups by id. Omitted ids default to visible. */
  readonly visibleGroups?: Readonly<Partial<Record<string, boolean>>> | undefined;
  /** Root class. Defaults to "mn-toolbar". */
  readonly className?: string | undefined;
}

// ---------------------------------------------------------------------------
// §10.7 Group-id types
// ---------------------------------------------------------------------------

/** Base group ids. */
export type BaseToolbarGroup = "marks" | "blocks" | "lists" | "link";
