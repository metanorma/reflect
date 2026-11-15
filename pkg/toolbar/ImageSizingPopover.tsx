/**
 * `ImageSizingPopover` — the size/role affordance for an existing image
 * (images-figures.md §8, schema.spec.md §17.8).
 *
 * A dedicated React component (`ImageSizingButton`) owns the popover's
 * controlled open state — a shell on the base popover/dialog layer
 * (MetanormaToolbar.spec.md §10.10): a `react-aria-components` `Popover` +
 * `Dialog`, anchored to the trigger and rendered in a portal at `<body>`,
 * sharing the `mn-image-dialog`-family form utilities (see
 * ImageInsertDialog.tsx).
 *
 * Fields: Width / Height (numeric-or-percent, empty = leave unchanged,
 * `auto` = clear) and the role choice (— / text-width / full-page-width).
 * Inputs are normalized through `normalizeImageSize` on Apply; a foreign
 * value (e.g. `10cm`) is an inline error, not a silent null. The apply
 * dispatch is `updateImageAttrs` (sizing scope) — the cross-node
 * role⇔size exclusion is the command's invariant, enforced in one
 * transaction.
 */

import React, { useEffect, useRef, useState } from "react";
import { Popover, Dialog } from "react-aria-components";
import type { RefObject } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import {
  updateImageAttrs,
  canUpdateImageAttrs,
} from "@metanorma/editor-commands";
import type { FigureRole } from "@metanorma/editor-commands";
import { normalizeImageSize } from "@metanorma/prosemirror-schema";
import type { ImageSizeValue } from "@metanorma/prosemirror-schema";

import { toolbarButtonClass } from "./ToolbarButtonView.js";

import "./image-dialog.css";

/** DOM id of the sizing dialog — the trigger's `aria-controls` target. */
const POPOVER_ID = "mn-image-sizing-popover";

/** Parse one size input: '' = absent (unchanged), 'auto' = null (clear),
 *  else normalized canonical value; null result for non-empty non-auto
 *  input means INVALID (the inline-error case). */
function parseSizeInput(
  raw: string,
): { kind: "absent" } | { kind: "clear" } | { kind: "set"; value: ImageSizeValue } | { kind: "invalid" } {
  const s = raw.trim();
  if (s === "") return { kind: "absent" };
  if (s.toLowerCase() === "auto") return { kind: "clear" };
  const value = normalizeImageSize(s);
  return value === null ? { kind: "invalid" } : { kind: "set", value };
}

/** The popover itself (images-figures.md §9 a11y: dialog pattern). */
function ImageSizingPopover({
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
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [role, setRole] = useState<"" | FigureRole>("");
  const [error, setError] = useState<string | null>(null);
  // The editor DOM element, captured at dispatch time so the commit path can
  // re-focus it synchronously (see settleFocusEditor below).
  const editorDomRef = useRef<HTMLElement | null>(null);

  // Reset-on-close (images-figures.md §8.5) — an effect on the open state
  // covers EVERY close path: commit (the controlled prop flips), Escape,
  // cancel, and light-dismiss (the RAC open-change event). Stale inputs are
  // not just cosmetic: because of the role⇔size exclusion, a leftover "150"
  // in Width would silently turn a role-only Apply into "size + role",
  // which cancel each other (schema §17.8).
  useEffect(() => {
    if (!isOpen) {
      setWidth("");
      setHeight("");
      setRole("");
      setError(null);
    }
  }, [isOpen]);

  const handleOpenChange = (open: boolean): void => {
    if (!open) onCancel();
    onOpenChange(open);
  };

  const dispatchApply = useEditorEventCallback(
    (view: EditorView | null, update: Parameters<typeof updateImageAttrs>[2]) => {
      if (view === null) return false;
      const ok = updateImageAttrs(view.state, view.dispatch, update);
      if (!ok) return false;
      editorDomRef.current = view.dom as HTMLElement;
      view.focus();
      return true;
    },
  );

  // The RAC overlay's unmount resets document.activeElement to <body> — even
  // clobbering an editor focus set before the close. Re-assert editor focus
  // AFTER the unmount commit, before the browser yields to the next action
  // (same guard as ImageInsertDialog).
  const settleFocusEditor = (): void => {
    const apply = (): void => { editorDomRef.current?.focus(); };
    queueMicrotask(apply);
    setTimeout(apply, 0);
  };

  async function onApplyInternal(): Promise<void> {
    const w = parseSizeInput(width);
    const h = parseSizeInput(height);
    if (w.kind === "invalid" || h.kind === "invalid") {
      setError("Sizes accept a number, a percent, or “auto”.");
      return;
    }
    const update = {
      ...(w.kind === "set" ? { width: w.value } : w.kind === "clear" ? { width: null } : {}),
      ...(h.kind === "set" ? { height: h.value } : h.kind === "clear" ? { height: null } : {}),
      ...(role !== "" ? { role } : {}),
    } as Parameters<typeof updateImageAttrs>[2];
    const ok = await dispatchApply(update);
    if (ok === false) {
      setError("No image found at the current selection.");
      return;
    }
    setError(null);
    onCommit();
    settleFocusEditor();
  }

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      triggerRef={triggerRef}
      offset={4}
      className="mn-image-sizing-dialog"
    >
      <Dialog
        id={POPOVER_ID}
        aria-label="Set image size"
        className="mn-image-sizing-dialog__body"
      >
        <div className="mn-toolbar-dialog-field">
          <label htmlFor="mn-img-size-w">Width</label>
          <input
            id="mn-img-size-w"
            type="text"
            autoComplete="off"
            placeholder="auto"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </div>
        <div className="mn-toolbar-dialog-field">
          <label htmlFor="mn-img-size-h">Height</label>
          <input
            id="mn-img-size-h"
            type="text"
            autoComplete="off"
            placeholder="auto"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </div>
        <div className="mn-toolbar-dialog-field">
          <label htmlFor="mn-img-size-role">Size mode</label>
          <select
            id="mn-img-size-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "" | FigureRole)}
          >
            <option value="">—</option>
            <option value="text-width">text-width</option>
            <option value="full-page-width">full-page-width</option>
          </select>
        </div>
        {error !== null ? (
          <div className="mn-toolbar-dialog-error" aria-live="polite">
            {error}
          </div>
        ) : null}
        <div className="mn-toolbar-dialog-actions">
          <button type="button" onClick={() => { onCancel(); }}>
            Cancel
          </button>
          <button type="button" onClick={() => { void onApplyInternal(); }}>
            Apply
          </button>
        </div>
      </Dialog>
    </Popover>
  );
}

/**
 * The toolbar control: trigger button + popover. Owns the controlled open
 * state; the trigger's `aria-expanded`/`aria-controls` reflect it (wired
 * explicitly per base §10.10).
 */
export function ImageSizingButton(): React.JSX.Element {
  const enabled = useEditorStateSelector(canUpdateImageAttrs);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePopover = (): void => {
    setOpen(false);
  };

  return (
    <div className="mn-toolbar-image-sizing">
      <button
        ref={triggerRef}
        type="button"
        className={toolbarButtonClass(false, enabled)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? POPOVER_ID : undefined}
        disabled={!enabled}
        title="Set image size / size mode"
        onClick={() => setOpen((o) => !o)}
      >
        Size
      </button>
      <ImageSizingPopover
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        onCommit={closePopover}
        onCancel={closePopover}
      />
    </div>
  );
}
