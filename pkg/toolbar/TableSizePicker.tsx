/**
 * `TableSizePicker` — the m × n grid-picker popover for table insertion
 * (tables.md §4, §5).
 *
 * A dedicated React component (`InsertTableButton`) owns the picker's open
 * state and renders the trigger button plus the popover. The popover is a
 * `role="grid"` of `MAX_ROWS × MAX_COLS` tiles; pointer-move and arrow keys
 * drive a `{ row, col }` highlight, and a click/Enter commits the dimension
 * via the pure `insertTable` command through a `useEditorEventCallback`.
 */

import React, { useRef, useState } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import { insertTable, canInsertTable, MAX_ROWS, MAX_COLS } from "@metanorma/editor-commands";

import "./table-picker.css";

/** The grid-picker popover itself (tables.md §5). */
export function TableSizePicker({
  onCommit,
  onCancel,
}: {
  readonly onCommit: (rows: number, cols: number) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

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
      case "Escape":
        e.preventDefault();
        onCancel();
        break;
      case "Tab":
        onCancel();
        break;
    }
  };

  return (
    <div
      className="mn-toolbar-popover"
      role="dialog"
      aria-label="Table size"
      aria-modal="false"
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
    </div>
  );
}

/**
 * The "Insert table" trigger button + popover (tables.md §4). Owns open state
 * and calls the pure `insertTable` command via `useEditorEventCallback`.
 */
export function InsertTableButton(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const enabled = useEditorStateSelector(canInsertTable);
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
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!enabled}
        title="Insert table"
          onClick={() => setOpen((v) => !v)}
        >
          Table
        </button>
      {open ? (
        <TableSizePicker
          onCommit={(r, c) => {
            setOpen(false);
            void insert(r, c);
            triggerRef.current?.focus();
          }}
          onCancel={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
