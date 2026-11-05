/**
 * `ImageSizingPopover` — the size/role affordance for an existing image
 * (images-figures.md §8, schema.spec.md §17.8).
 *
 * A dedicated React component (`ImageSizingButton`) owns the popover's open
 * state, exactly the `InsertImageButton` pattern (HTML Popover API +
 * `mn-image-dialog`-family styling; see ImageInsertDialog.tsx).
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
  onCommit,
  onCancel,
  ref,
}: {
  readonly onCommit: () => void;
  readonly onCancel: () => void;
  readonly ref?: React.Ref<HTMLDivElement> | undefined;
}): React.JSX.Element {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [role, setRole] = useState<"" | FigureRole>("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Reset the fields whenever the popover closes — via commit, Escape,
  // cancel, OR light-dismiss (popover=auto outside click). Stale inputs
  // are not just cosmetic here: because of the role⇔size exclusion, a
  // leftover "150" in Width would silently turn a role-only Apply into
  // "size + role", which cancel each other (§17.8).
  useEffect(() => {
    const el = rootRef.current;
    if (el === null) return;
    const onToggle = (e: Event): void => {
      if (!(e as ToggleEvent).newState || (e as ToggleEvent).newState !== "open") {
        setWidth("");
        setHeight("");
        setRole("");
        setError(null);
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  const dispatchApply = useEditorEventCallback(
    (view: EditorView | null, update: Parameters<typeof updateImageAttrs>[2]) => {
      if (view === null) return false;
      const ok = updateImageAttrs(view.state, view.dispatch, update);
      if (!ok) return false;
      view.focus();
      return true;
    },
  );

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
  }

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        // Forward the caller's ref too (React 19 ref-as-prop).
        if (typeof ref === "function") ref(node);
        else if (ref !== null && typeof ref === "object") {
          (ref as React.RefObject<HTMLDivElement | null>).current = node;
        }
      }}
      popover="auto"
      className="mn-image-sizing-dialog"
      role="dialog"
      aria-label="Set image size"
      aria-modal="false"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
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
    </div>
  );
}

/** The toolbar control: trigger button + popover (InsertImageButton pattern). */
export function ImageSizingButton(): React.JSX.Element {
  const enabled = useEditorStateSelector(canUpdateImageAttrs);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = (): void => {
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <div className="mn-toolbar-image-sizing">
      <button
        ref={triggerRef}
        type="button"
        className={toolbarButtonClass(false, enabled)}
        aria-haspopup="dialog"
        disabled={!enabled}
        title="Set image size / size mode"
        onClick={() => popoverRef.current?.togglePopover()}
      >
        Size
      </button>
      <ImageSizingPopover
        ref={popoverRef}
        onCommit={closePopover}
        onCancel={closePopover}
      />
    </div>
  );
}
