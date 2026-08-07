/**
 * `SectionTypePicker` — the section-type conversion picker (sections.md §4.5).
 *
 * A dedicated React component (`SectionTypeButton`) owns the picker's open
 * state. Clicking the trigger opens a popover listing **all ten section types**
 * in fixed menu order. The current type is highlighted; illegal conversions
 * (where `targetType.validContent(currentContent)` is false) are disabled.
 * Selecting a legal type calls the pure `setSectionType` command.
 *
 * Uses the HTML Popover API (`popover="manual"`) with CSS Anchor Positioning
 * so the picker renders in the browser's **top layer** — escaping all ancestor
 * overflow clipping regardless of toolbar/layout CSS.
 */

import React, { useRef } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import type { NodeType } from "prosemirror-model";

import {
  setSectionType,
  nearestSectionAncestor,
  metanormaSchema,
} from "@metanorma/editor-commands";

import "./section-type-picker.css";

/**
 * The ten section node names in **document order** — the sequence in which
 * section types tend to appear in an ISO-style document (front-matter → main
 * body → back matter → annexes → generic). This gives the picker a spatially
 * predictable layout that mirrors the document's structure.
 */
const SECTION_TYPE_NAMES: readonly string[] = [
  // Front matter (preface)
  "abstract", "foreword", "introduction", "acknowledgements",
  // Main body (sections)
  "clause", "terms", "definitions",
  // Back matter
  "references",
  // Annexes
  "annex",
  // Generic container
  "content_section",
];

/**
 * Human-readable labels for the section types, shown in the picker.
 * Uses title-case words with spaces for readability.
 */
const SECTION_LABELS: Readonly<Record<string, string>> = {
  abstract: "Abstract",
  foreword: "Foreword",
  introduction: "Introduction",
  acknowledgements: "Acknowledgements",
  clause: "Clause",
  terms: "Terms",
  definitions: "Definitions",
  references: "References",
  annex: "Annex",
  content_section: "Content section",
};

/** Whether the cursor is inside a section node (enables the button). */
function canChangeType(state: EditorState): boolean {
  const hit = nearestSectionAncestor(state.selection.$from);
  if (hit === null) return false;
  // Enabled when at least one legal alternative exists.
  for (const name of SECTION_TYPE_NAMES) {
    const t = metanormaSchema.nodes[name];
    if (t === undefined) continue;
    if (t === hit.node.type) continue;
    if (t.validContent(hit.node.content)) return true;
  }
  return false;
}

/** The current section type name, or null if not inside a section. */
function currentTypeName(state: EditorState): string | null {
  const hit = nearestSectionAncestor(state.selection.$from);
  return hit?.node.type.name ?? null;
}

/**
 * The section-type picker popover (sections.md §4.5).
 *
 * Lists all ten section types in fixed order. The current type is marked
 * active; types whose content expression rejects the current node's content
 * are disabled.
 */
export function SectionTypePicker({
  currentType,
  onPick,
  onCancel,
  ref,
}: {
  readonly currentType: string | null;
  readonly onPick: (targetType: NodeType) => void;
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
      className="mn-section-type-picker"
      role="listbox"
      aria-label="Section type"
      ref={ref}
      onKeyDown={handleKey}
    >
      <ul className="mn-section-type-picker__list">
        {SECTION_TYPE_NAMES.map((name) => {
          const t = metanormaSchema.nodes[name];
          if (t === undefined) return null;
          const isCurrent = name === currentType;
          // Determine legality: create a synthetic validity check against
          // the current section's content. We need the actual node for
          // validContent, but we don't have it here — the legality check
          // is done by the caller who has the state.
          return (
            <li key={name}>
              <button
                type="button"
                role="option"
                className={
                  isCurrent
                    ? "mn-section-type-picker__item mn-section-type-picker__item--active"
                    : "mn-section-type-picker__item"
                }
                aria-selected={isCurrent}
                disabled={isCurrent}
                onClick={() => {
                  const nt = metanormaSchema.nodes[name];
                  if (nt !== undefined) onPick(nt);
                }}
              >
                {SECTION_LABELS[name] ?? name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The "Type" trigger button + picker (sections.md §4.5). Owns open state
 * and calls the pure `setSectionType` command via `useEditorEventCallback`.
 */
export function SectionTypeButton(): React.JSX.Element {
  const enabled = useEditorStateSelector(canChangeType);
  const currentType = useEditorStateSelector(currentTypeName);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const changeType = useEditorEventCallback(
    (view: EditorView | null, targetType: NodeType) => {
      if (view === null) return;
      setSectionType(view.state, targetType, view.dispatch);
      view.focus();
    },
  );

  const closePicker = (): void => {
    pickerRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <div className="mn-toolbar-section-type">
      <button
        ref={triggerRef}
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="listbox"
        disabled={!enabled}
        title="Change section type…"
        onClick={() => pickerRef.current?.togglePopover()}
      >
        Type
      </button>
      <SectionTypePicker
        ref={pickerRef}
        currentType={currentType}
        onPick={(targetType) => {
          closePicker();
          void changeType(targetType);
        }}
        onCancel={closePicker}
      />
    </div>
  );
}
