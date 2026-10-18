/**
 * `ImageInsertDialog` — the URL/upload dialog for adding an image to a figure
 * (images-figures.md §4.2, §5).
 *
 * A dedicated React component (`InsertImageButton`) owns the dialog's open
 * state. The dialog collects a Source URL **or** a File plus optional Alt text,
 * resolves the `src` (synchronously for URLs, asynchronously for files via
 * `readAsDataURL` or the `onImageUpload` hook), then dispatches the pure
 * `insertImageIntoFigure` command. The button is single-mode: enabled exactly
 * when the selection is inside a figure with no image child
 * (`canInsertImageIntoFigure`). The `EditorView`/async/DOM concerns stay in
 * this adapter; the pure command is synchronous.
 *
 * Uses the HTML Popover API (`popover="auto"`) with CSS Anchor Positioning
 * so the dialog renders in the browser's **top layer** — escaping all ancestor
 * overflow clipping regardless of toolbar/layout CSS.
 */

import React, { useRef, useState } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import { insertImageIntoFigure, canInsertImageIntoFigure } from "@metanorma/editor-commands";
import type { OnImageUpload } from "./AdvancedMetanormaToolbar.js";

import "./image-dialog.css";

/** Read a File as a data: URL (images-figures.md §5.2 default path). */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("FileReader produced a non-string result"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

/** The dialog itself (images-figures.md §5). */
export function ImageInsertDialog({
  onImageUpload,
  onCommit,
  onCancel,
  ref,
}: {
  readonly onImageUpload?: OnImageUpload | undefined;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
  readonly ref?: React.Ref<HTMLDivElement> | undefined;
}): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const dispatchInsert = useEditorEventCallback(
    async (view: EditorView | null, resolvedSrc: string, resolvedAlt: string | null) => {
      if (view === null) return false;
      const ok = insertImageIntoFigure(view.state, view.dispatch, {
        src: resolvedSrc,
        alt: resolvedAlt,
      });
      if (!ok) return false; // selection moved out / src invalid — soft failure
      view.focus();
      return true;
    },
  );

  async function onCommitInternal(): Promise<void> {
    let src: string | null = null;
    try {
      if (file !== null) {
        src = onImageUpload !== undefined
          ? await onImageUpload(file)
          : await readAsDataURL(file);
      } else if (url.trim() !== "") {
        src = url.trim();
      }
    } catch {
      setError("Could not read this image. Try a smaller image or supply onImageUpload.");
      return;
    }
    if (src === null) {
      setError("Image URL or file is required.");
      return;
    }
    setError(null);
    const ok = await dispatchInsert(src, alt.trim() === "" ? null : alt);
    if (ok === false) {
      // images-figures.md §7 rule 2 — validate at dispatch time: the
      // selection may have left the figure during an async upload.
      setError("Insertion point is no longer inside a figure.");
      return;
    }
    onCommit();
  }

  return (
    // `popover="auto"`: top-layer rendering with light-dismiss (outside click,
    // Escape, and auto-close when another popover opens).
    // The CSS class `mn-image-dialog` is self-contained — it does NOT use
    // the shared `.mn-toolbar-dialog` base class because the consumer's
    // vertical-toolbar override targets `.mn-toolbar-dialog` with `right: 100%`,
    // which would conflict with anchor positioning.
    <div
      popover="auto"
      className="mn-image-dialog"
      role="dialog"
      aria-label="Add image to figure"
      aria-modal="false"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="mn-toolbar-dialog-field">
        <label htmlFor="mn-img-src">Image URL</label>
        <input
          ref={urlRef}
          id="mn-img-src"
          type="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="mn-toolbar-dialog-field">
        <label htmlFor="mn-img-file">Image file</label>
        <input
          id="mn-img-file"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files;
            setFile(f !== null && f.length > 0 ? (f[0] ?? null) : null);
          }}
        />
      </div>
      <div className="mn-toolbar-dialog-field">
        <label htmlFor="mn-img-alt">Alternative text</label>
        <input
          id="mn-img-alt"
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
        />
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
        <button type="button" onClick={() => { void onCommitInternal(); }}>
          Insert
        </button>
      </div>
    </div>
  );
}

/**
 * The "Add image to figure" trigger button + dialog (images-figures.md §4.2).
 * Single-mode: enabled exactly when the selection is inside a figure with no
 * image child. Owns open state and resolves the source before dispatching the
 * pure `insertImageIntoFigure` command.
 */
export function InsertImageButton({
  onImageUpload,
}: {
  readonly onImageUpload?: OnImageUpload | undefined;
}): React.JSX.Element {
  const enabled = useEditorStateSelector(canInsertImageIntoFigure);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeDialog = (): void => {
    dialogRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <div className="mn-toolbar-image">
      <button
        ref={triggerRef}
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        disabled={!enabled}
        title="Add image to figure"
        onClick={() => dialogRef.current?.togglePopover()}
      >
        Image
      </button>
      <ImageInsertDialog
        ref={dialogRef}
        onImageUpload={onImageUpload}
        onCommit={closeDialog}
        onCancel={closeDialog}
      />
    </div>
  );
}
