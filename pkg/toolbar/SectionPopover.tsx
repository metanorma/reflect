/**
 * `SectionPopover` — section insertion popover (sections.md §4.2).
 *
 * A single trigger button ("Section") whose popover lists all ten section
 * types grouped by cohort (front matter / body / annexes / back matter).
 * Selecting a type calls the pure `insertSection` command, which routes the
 * new section to the correct container based on its cohort — creating the
 * container (`preface`, `sections`, `bibliography`) if it does not exist.
 *
 * A shell on the base popover/dialog layer (MetanormaToolbar.spec.md §10.10):
 * a `react-aria-components` `Popover` + `Dialog`, anchored to the trigger and
 * rendered in a portal at `<body>`; Escape/outside close it, focus returns to
 * the trigger. On open, focus moves to the first section-type button
 * (sections.md §4.2).
 */

import React, { useEffect, useRef, useState } from "react";
import { Popover, Dialog } from "react-aria-components";
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

/** DOM id of the popover dialog — the trigger's `aria-controls` target. */
const POPOVER_ID = "mn-section-popover-dialog";

// ---------------------------------------------------------------------------
// SectionPopover trigger + popover
// ---------------------------------------------------------------------------

/**
 * The Section insertion trigger button + popover. The button is always enabled
 * (there is always a valid insertion target — `insertSection` creates the
 * container if missing). Clicking opens the popover; selecting a type inserts
 * a section of that type and closes the popover. The trigger's
 * `aria-expanded`/`aria-controls` reflect the open state (wired explicitly
 * per base §10.10).
 */
export function SectionPopover(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Open-focus lands on the first section-type button (sections.md §4.2) —
  // RAC's default open-focus is the dialog container, so move it onward.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>(".mn-section-popover__item")
        ?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

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

  const handlePick = (typeName: string): void => {
    setOpen(false);
    void insert(typeName);
  };

  return (
    <div className="mn-toolbar-section">
      <button
        ref={triggerRef}
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? POPOVER_ID : undefined}
        title="Insert a section"
        onClick={() => setOpen((o) => !o)}
      >
        Section
      </button>
      <Popover
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        offset={4}
        className="mn-section-popover"
      >
        <Dialog id={POPOVER_ID} aria-label="Insert a section">
          <div ref={contentRef}>
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
        </Dialog>
      </Popover>
    </div>
  );
}
