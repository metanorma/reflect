/**
 * `ImageInsertDialog` — the URL/upload dialog for adding an image to a figure
 * (images-figures.md §4.2, §5).
 *
 * A dedicated React component (`InsertImageButton`) owns the dialog's
 * controlled open state. The dialog collects a Source URL **or** a File plus
 * optional Alt text, resolves the `src` (synchronously for URLs,
 * asynchronously for files via `readAsDataURL` or the `onImageUpload` hook),
 * then dispatches the pure `insertImageIntoFigure` command. The button is
 * single-mode: enabled exactly when the selection is inside a figure with no
 * image child (`canInsertImageIntoFigure`). The `EditorView`/async/DOM
 * concerns stay in this adapter; the pure command is synchronous.
 *
 * A shell on the base popover/dialog layer (MetanormaToolbar.spec.md §10.10):
 * a `react-aria-components` `Popover` + `Dialog`, anchored to the trigger and
 * rendered in a portal at `<body>` (top layer — escaping all ancestor
 * overflow clipping regardless of toolbar/layout CSS). On open, focus moves
 * to the Source URL field (images-figures.md §9.3); on close it returns to
 * the trigger.
 */

import React, { useRef, useState } from "react";
import { Popover, Dialog } from "react-aria-components";
import type { RefObject } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import { insertImageIntoFigure, canInsertImageIntoFigure } from "@metanorma/editor-commands";
import { inferMimetype } from "@metanorma/prosemirror-schema";
import type { OnImageUpload } from "./AdvancedMetanormaToolbar.js";
import { toolbarButtonClass } from "./ToolbarButtonView.js";

import "./image-dialog.css";

/** DOM id of the insert dialog — the trigger's `aria-controls` target. */
const POPOVER_ID = "mn-image-insert-dialog";

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

/**
 * Decode the intrinsic dimensions of a resolved `src` at commit (§6.1
 * `x-natural-*` declaration): `new Image()` + `decode()`, raced against a
 * timeout so a slow or hanging remote URL never blocks insertion — capture
 * fails soft to `null`. A non-positive `naturalWidth`/`naturalHeight`
 * (SVG without intrinsic size reports zero/default geometry) also yields
 * `null` — never a bogus capture.
 */
const NATURAL_SIZE_TIMEOUT_MS = 3000;

async function decodeNaturalSize(
  src: string,
): Promise<{ width: number | null; height: number | null }> {
  try {
    const img = new Image();
    img.src = src;
    const decoded = await Promise.race([
      img.decode().then(() => img),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("decode timeout")), NATURAL_SIZE_TIMEOUT_MS);
      }),
    ]);
    const width = decoded.naturalWidth;
    const height = decoded.naturalHeight;
    return { width: width > 0 ? width : null, height: height > 0 ? height : null };
  } catch {
    return { width: null, height: null };
  }
}

/** The dialog itself (images-figures.md §5) — the RAC shell of §10.10. */
export function ImageInsertDialog({
  isOpen,
  onOpenChange,
  triggerRef,
  onImageUpload,
  onCommit,
  onCancel,
}: {
  /** Whether the dialog is open (controlled). */
  readonly isOpen: boolean;
  /** Called when the dialog should close (Escape, click-outside). */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Ref of the trigger button — RAC positions the dialog relative to it. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly onImageUpload?: OnImageUpload | undefined;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The editor DOM element, captured at dispatch time so the commit path can
  // re-focus it synchronously (see settleFocus below).
  const editorDomRef = useRef<HTMLElement | null>(null);

  const dispatchInsert = useEditorEventCallback(
    async (
      view: EditorView | null,
      resolvedSrc: string,
      resolvedAlt: string | null,
      resolvedMimetype: string,
      xNaturalWidth: number | null,
      xNaturalHeight: number | null,
    ) => {
      if (view === null) return false;
      const ok = insertImageIntoFigure(view.state, view.dispatch, {
        src: resolvedSrc,
        alt: resolvedAlt,
        mimetype: resolvedMimetype,
        xNaturalWidth,
        xNaturalHeight,
      });
      if (!ok) return false; // selection moved out / src invalid — soft failure
      editorDomRef.current = view.dom as HTMLElement;
      view.focus();
      return true;
    },
  );

  // The RAC overlay's unmount resets document.activeElement to <body> — even
  // clobbering an editor focus set before the close. Re-assert focus AFTER
  // the unmount commit: a microtask plus a macrotask both run before the
  // browser yields to the next user/automation action, so typing resumes in
  // the document deterministically (editor after a commit, trigger after a
  // cancel).
  const settleFocus = (target: "editor" | "trigger"): void => {
    const apply = (): void => {
      if (target === "trigger") triggerRef.current?.focus();
      else editorDomRef.current?.focus();
    };
    queueMicrotask(apply);
    setTimeout(apply, 0);
  };

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
    // Sizing axis at commit (§17.4, §6.1): mimetype inference (total — for
    // the URL path, neither a Blob `type` nor a `data:` prefix exists, so
    // this is the extension map or the UNKNOWN_MIMETYPE marker; all stored
    // as-is), then intrinsic-size capture, which must never block insertion.
    const mimetype = inferMimetype(src, file?.type);
    const natural = await decodeNaturalSize(src);
    setError(null);
    const ok = await dispatchInsert(
      src,
      alt.trim() === "" ? null : alt,
      mimetype,
      natural.width,
      natural.height,
    );
    if (ok === false) {
      // images-figures.md §7 rule 2 — validate at dispatch time: the
      // selection may have left the figure during an async upload.
      setError("Insertion point is no longer inside a figure.");
      return;
    }
    onCommit();
    settleFocus("editor");
  }

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
      className="mn-image-dialog"
    >
      <Dialog
        id={POPOVER_ID}
        aria-label="Add image to figure"
        className="mn-image-dialog__body"
      >
        <div className="mn-toolbar-dialog-field">
          <label htmlFor="mn-img-src">Image URL</label>
          <input
            id="mn-img-src"
            type="url"
            autoComplete="off"
            // Open-focus lands on the source-url field (images-figures.md
            // §9.3) — the content mounts only while open, so autoFocus
            // fires on each open.
            autoFocus
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
          <button type="button" onClick={() => { onCancel(); settleFocus("trigger"); }}>
            Cancel
          </button>
          <button type="button" onClick={() => { void onCommitInternal(); }}>
            Insert
          </button>
        </div>
      </Dialog>
    </Popover>
  );
}

/**
 * The "Add image to figure" trigger button + dialog (images-figures.md §4.2).
 * Single-mode: enabled exactly when the selection is inside a figure with no
 * image child. Owns the controlled open state and resolves the source before
 * dispatching the pure `insertImageIntoFigure` command. The trigger's
 * `aria-expanded`/`aria-controls` reflect the open state (wired explicitly
 * per base §10.10).
 */
export function InsertImageButton({
  onImageUpload,
}: {
  readonly onImageUpload?: OnImageUpload | undefined;
}): React.JSX.Element {
  const enabled = useEditorStateSelector(canInsertImageIntoFigure);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeDialog = (): void => {
    setOpen(false);
  };

  return (
    <div className="mn-toolbar-image">
      <button
        ref={triggerRef}
        type="button"
        className={toolbarButtonClass(false, enabled)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? POPOVER_ID : undefined}
        disabled={!enabled}
        title="Add image to figure"
        onClick={() => setOpen((o) => !o)}
      >
        Image
      </button>
      <ImageInsertDialog
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        onImageUpload={onImageUpload}
        onCommit={closeDialog}
        onCancel={closeDialog}
      />
    </div>
  );
}
