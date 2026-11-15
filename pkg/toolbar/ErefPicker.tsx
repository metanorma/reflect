/**
 * `ErefPicker` — the doc-anchored bibliography picker for `eref`
 * (reference-marks.md §5.2).
 *
 * Lists the document's `bibitem` atoms as `(key, title)` pairs — harvested
 * from the click-time captured document by `ErefButton` (refsGroup.tsx) via
 * `@metanorma/relaton`'s `collectBibliographyItems`, rendered with
 * `citeas`/`label` — plus a manual citation-key input for forward references
 * (entries not yet in the document).
 *
 * A shell on the base popover/dialog layer (MetanormaToolbar.spec.md §10.10):
 * a `react-aria-components` `Popover` + `Dialog`, anchored to the trigger and
 * rendered in a portal at `<body>`. The manual input is focused on open;
 * focus returns to the trigger on close. While open, the picker holds its own
 * `useEditorStateSelector` subscription to the live bibliography count — the
 * reactivity anchor that previously lived as an always-on selector plus a
 * hidden span in the trigger button — which distinguishes "the document has
 * no bibliography" from "the captured items lack a citable key".
 */

import React, { useState } from "react";
import { Popover, Dialog } from "react-aria-components";
import type { RefObject } from "react";

import { useEditorStateSelector } from "@handlewithcare/react-prosemirror";
import { collectBibliographyItems, citeas, label } from "@metanorma/relaton";
import type { BibliographicItem } from "@metanorma/relaton";

import "./reference-marks.css";

/** DOM id of the picker dialog — the trigger's `aria-controls` target. */
export const EREF_PICKER_DIALOG_ID = "mn-eref-picker-dialog";

/**
 * The bibliography picker popover — the RAC shell of §10.10 with the entry
 * list and manual-key entry inside.
 */
export function ErefPicker({
  isOpen,
  onOpenChange,
  triggerRef,
  items,
  onPick,
  onCancel,
}: {
  /** Whether the popover is open (controlled). */
  readonly isOpen: boolean;
  /** Called when the popover should close (Escape, click-outside). */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Ref of the trigger button — RAC positions the popover relative to it. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** Bibitem atoms harvested from the click-time captured document. */
  readonly items: readonly BibliographicItem[];
  readonly onPick: (cite: string) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [manual, setManual] = useState("");
  // Live bibliography count — a primitive, referentially stable for
  // useSyncExternalStore; drives the empty-state wording.
  const liveCount = useEditorStateSelector(
    (s) => collectBibliographyItems(s.doc).length,
  );

  // Escape/outside are handled by the RAC shell (§10.10): onOpenChange(false)
  // is the cancel path, with focus returned to the trigger.
  const handleOpenChange = (open: boolean): void => {
    if (!open) onCancel();
    onOpenChange(open);
  };

  const dedupedItems = new Map<string, BibliographicItem>();
  for (const item of items) {
    const key = citeas(item);
    if (key !== null && !dedupedItems.has(key)) {
      dedupedItems.set(key, item);
    }
  }
  const knownItems = [...dedupedItems.values()];

  const submitManual = (): void => {
    const key = manual.trim();
    if (key !== "") onPick(key);
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      triggerRef={triggerRef}
      offset={4}
      className="mn-eref-picker"
    >
      <Dialog id={EREF_PICKER_DIALOG_ID} aria-label="Select a reference">
        <div className="mn-eref-picker__body">
          <div className="mn-eref-picker__header">Select a reference</div>
          {knownItems.length > 0 ? (
            <ul className="mn-eref-picker__list">
              {knownItems.map((item) => {
                const key = citeas(item);
                if (key === null) return null;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="mn-eref-picker__item"
                      onClick={() => onPick(key)}
                    >
                      {label(item)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mn-eref-picker__empty">
              {liveCount === 0
                ? "No bibliography entries yet. Enter a citation key manually below."
                : "No citable entries (missing a citeas key). Enter a citation key manually below."}
            </div>
          )}
          <div className="mn-eref-picker__manual">
            <input
              type="text"
              className="mn-eref-picker__input"
              placeholder="Citation key (e.g. ISO1234)"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitManual();
              }}
              autoFocus
            />
            <button
              type="button"
              className="mn-eref-picker__btn"
              onClick={submitManual}
            >
              Insert
            </button>
          </div>
          <button type="button" className="mn-eref-picker__cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </Dialog>
    </Popover>
  );
}
