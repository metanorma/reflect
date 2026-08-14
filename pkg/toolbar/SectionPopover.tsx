/**
 * `SectionPopover` — section insertion popover (sections.md §4.1).
 *
 * A single trigger button ("Section") whose popover lists all ten section
 * types grouped by cohort (front matter / body / back matter). Selecting a
 * type calls the pure `insertSection` command, which routes the new section to
 * the correct container based on its cohort — creating the container
 * (`preface`, `sections`, `bibliography`) if it does not exist.
 *
 * Uses the HTML Popover API (`popover="auto"`) with CSS Anchor Positioning,
 * same as the other toolbar pickers (`TableSizePicker`, `FootnotePicker`,
 * `TargetPicker`). `popover="auto"` provides light-dismiss: the browser
 * automatically closes the popover when the user clicks outside it or presses
 * Escape.
 */

import React, { useRef } from "react";
import type { EditorView } from "prosemirror-view";

import {
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import {
  insertSection,
} from "@metanorma/editor-commands";
import {
  FRONT_TYPES, BODY_TYPES, ANNEX_TYPES, BACK_TYPES,
} from "@metanorma/prosemirror-schema";

import "./section-popover.css";

// ---------------------------------------------------------------------------
// Section labels and grouped menu data
// ---------------------------------------------------------------------------

/** Human-readable labels for the section types, shown in the popover. */
const SECTION_LABELS: Readonly<Record<string, string>> = {
  abstract: "Abstract",
  foreword: "Foreword",
  introduction: "Introduction",
  acknowledgements: "Acknowledgements",
  clause: "Clause",
  annex: "Annex",
  content_section: "Content section",
  terms: "Terms",
  definitions: "Definitions",
  references: "References",
};

/** Menu groups in document-appearance order. */
interface MenuGroup {
  readonly heading: string;
  readonly types: readonly string[];
}

const MENU_GROUPS: readonly MenuGroup[] = [
  { heading: "Front matter", types: FRONT_TYPES },
  { heading: "Body", types: BODY_TYPES },
  { heading: "Annexes", types: ANNEX_TYPES },
  { heading: "Back matter", types: BACK_TYPES },
];

// ---------------------------------------------------------------------------
// SectionPopover trigger + popover
// ---------------------------------------------------------------------------

/**
 * The Section insertion trigger button + popover. The button is always enabled
 * (there is always a valid insertion target — `insertSection` creates the
 * container if missing). Clicking opens the popover; selecting a type inserts
 * a section of that type and closes the popover.
 */
export function SectionPopover(): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Insert the chosen section type via the pure command. Capture state/dispatch
  // synchronously (the command itself is synchronous, but follow the stale-view
  // guard convention for consistency).
  const insert = useEditorEventCallback(
    (view: EditorView | null, typeName: string) => {
      if (view === null) return;
      const { state, dispatch } = view;
      insertSection(state, typeName, dispatch);
      view.focus();
    },
  );

  const handleClick = (): void => {
    popoverRef.current?.showPopover();
  };

  const closePopover = (): void => {
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  const handlePick = (typeName: string): void => {
    closePopover();
    void insert(typeName);
  };

  return (
    <div className="mn-toolbar-section">
      <button
        ref={triggerRef}
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        title="Insert a section"
        onClick={handleClick}
      >
        Section
      </button>
      <div
        ref={popoverRef}
        popover="auto"
        className="mn-section-popover"
        role="dialog"
        aria-label="Insert a section"
        aria-modal="false"
      >
        {MENU_GROUPS.map((group) => (
          <div key={group.heading} className="mn-section-popover__group">
            <div className="mn-section-popover__heading">{group.heading}</div>
            <ul className="mn-section-popover__list">
              {group.types.map((typeName) => (
                <li key={typeName}>
                  <button
                    type="button"
                    className="mn-section-popover__item"
                    data-type={typeName}
                    onClick={() => handlePick(typeName)}
                  >
                    {SECTION_LABELS[typeName] ?? typeName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
