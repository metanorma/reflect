/**
 * `TableSizePicker` — the m × n grid-picker popover for table insertion
 * (tables.md §4, §5).
 *
 * A dedicated React component (`InsertTableButton`) owns the picker's open
 * state and renders the trigger button plus the popover. The popover is a
 * `role="grid"` of `MAX_ROWS × MAX_COLS` tiles; pointer-move and arrow keys
 * drive a `{ row, col }` highlight, and a click/Enter commits the dimension
 * via the pure `insertTable` command through a `useEditorEventCallback`.
 *
 * A shell on the base popover/dialog layer (MetanormaToolbar.spec.md §10.10):
 * a `react-aria-components` `Popover` + `Dialog`, anchored to the trigger and
 * rendered in a portal at `<body>` (top layer — escapes all ancestor overflow
 * clipping regardless of toolbar/layout CSS). Focus opens on the (1, 1)
 * roving cell (tables.md §6.2) and returns to the trigger on close.
 */

import React, { useEffect, useRef, useState } from "react";
import { Popover, Dialog } from "react-aria-components";
import type { RefObject } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import { insertTable, canInsertTable, MAX_ROWS, MAX_COLS } from "@metanorma/editor-commands";

import { toolbarButtonClass } from "./ToolbarButtonView.js";
import "./table-picker.css";

/** DOM id of the picker dialog — the trigger's `aria-controls` target. */
const POPOVER_ID = "mn-table-picker-popover";

/**
 * The grid-picker popover itself (tables.md §5) — the RAC shell of
 * MetanormaToolbar.spec.md §10.10 with the roving grid inside.
 */
export function TableSizePicker({
  isOpen,
  onOpenChange,
  triggerRef,
  onCommit,
  onCancel,
}: {
  /** Whether the popover is open (controlled). */
  readonly isOpen: boolean;
  /** Called when the popover should close (Escape, click-outside). */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Ref of the trigger button — RAC positions the popover relative to it. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly onCommit: (rows: number, cols: number) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  // Open-focus lands on the (1, 1) roving cell (tables.md §6.2) — RAC's
  // default open-focus is the dialog container, so move it onward explicitly.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>('[tabindex="0"]')
        ?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        setCol((c) => Math.min(MAX_COLS, c + 1));
        break;
      case "ArrowLeft":
        e.preventDefault();
        setCol((c) => Math.max(1, c - 1));
        break;
      case "ArrowDown":
        e.preventDefault();
        setRow((r) => Math.min(MAX_ROWS, r + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setRow((r) => Math.max(1, r - 1));
        break;
      case "Home":
        e.preventDefault();
        setCol(1);
        break;
      case "End":
        e.preventDefault();
        setCol(MAX_COLS);
        break;
      case "PageDown":
        e.preventDefault();
        setRow(MAX_ROWS);
        break;
      case "PageUp":
        e.preventDefault();
        setRow(1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onCommit(row, col);
        break;
      case "Tab":
        onCancel();
        break;
    }
  };

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
      className="mn-table-picker"
    >
      <Dialog
        id={POPOVER_ID}
        aria-label="Table size"
      >
        <div
          ref={gridRef}
          className="mn-toolbar-grid"
          role="grid"
          aria-readonly="true"
          aria-rowcount={MAX_ROWS}
          aria-colcount={MAX_COLS}
          onKeyDown={handleKey}
          style={{ ["--cols" as string]: MAX_COLS, ["--rows" as string]: MAX_ROWS }}
        >
          {Array.from({ length: MAX_ROWS }, (_, r) =>
            Array.from({ length: MAX_COLS }, (_, c) => {
              const on = r < row && c < col;
              const focused = r === row - 1 && c === col - 1;
              return (
                <div
                  key={`${r}-${c}`}
                  role="gridcell"
                  className={
                    on ? "mn-toolbar-gridcell mn-toolbar-gridcell--on" : "mn-toolbar-gridcell"
                  }
                  aria-rowindex={r + 1}
                  aria-colindex={c + 1}
                  aria-selected={on}
                  tabIndex={focused ? 0 : -1}
                  aria-label={`row ${r + 1} column ${c + 1}`}
                  onMouseEnter={() => {
                    setRow(r + 1);
                    setCol(c + 1);
                  }}
                  onClick={() => onCommit(r + 1, c + 1)}
                />
              );
            }),
          )}
        </div>
        <div className="mn-toolbar-grid-readout" aria-live="polite">
          {row} × {col}
        </div>
      </Dialog>
    </Popover>
  );
}

/**
 * The "Insert table" trigger button + popover (tables.md §4). Owns the
 * controlled open state and calls the pure `insertTable` command via
 * `useEditorEventCallback`. The trigger's `aria-expanded`/`aria-controls`
 * reflect the open state (tables.md §6.1; wired explicitly per §10.10).
 */
export function InsertTableButton(): React.JSX.Element {
  const enabled = useEditorStateSelector(canInsertTable);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const insert = useEditorEventCallback(
    (view: EditorView | null, r: number, c: number) => {
      if (view === null) return;
      insertTable(view.state, view.dispatch, r, c);
      view.focus();
    },
  );

  return (
    <div className="mn-toolbar-table">
      <button
        ref={triggerRef}
        type="button"
        className={toolbarButtonClass(false, enabled)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? POPOVER_ID : undefined}
        disabled={!enabled}
        title="Insert table"
        onClick={() => setOpen((o) => !o)}
      >
        Table
      </button>
      <TableSizePicker
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        onCommit={(r, c) => {
          setOpen(false);
          void insert(r, c);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
