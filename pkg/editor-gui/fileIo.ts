/**
 * Document file I/O for the editor shell (FileFormat.spec.md §5–§6).
 *
 * `useMnFileIo` owns the Save/Open handlers and the session carry of
 * preserved envelope members (meta, foreign top-level keys): Open decodes a
 * parsed file through the §5 read chain and rehydrates the bare tree; Save
 * wraps the current tree in a fresh envelope at the current versions (§6) —
 * versions are stamped on the envelope at save time only, never in editor
 * state, never as a ProseMirror transaction.
 */
import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { EditorState } from '@metanorma/prosemirror-editor';
import { fileSave, fileOpen } from 'browser-fs-access';
import { decodeEnvelope, encodeEnvelope } from '@metanorma/file-format';

/**
 * The `meta.generator` provenance string — a `<product> <version>` string
 * (FileFormat.spec.md §3's format line; version syntax: semver). Hand-set
 * and hand-maintained with no source of truth and no derivation: no
 * repository manifest carries a product `version`, and
 * `@metanorma/file-format`'s own package version is the library's, not the
 * product's (never imported here). Bumped by hand at the orchestrator's
 * discretion until a build stamp replaces the hand-edit. Its only contract
 * is non-normativity: readers never branch on it (§3).
 */
const GENERATOR = 'Reflect 0.1.0';

/** Preserved envelope members carried from load to the next save (§3, §5). */
interface FileParts {
  meta: Record<string, unknown> | null;
  foreign: Record<string, unknown>;
}

/**
 * The editor shell's Save/Open handlers. Both identities are stable
 * (stable-ref / stable-callback dependencies), safe for ChromeBar's
 * memoization.
 */
export function useMnFileIo(opts: {
  editorStateRef: RefObject<EditorState>;
  loadDocFromJson: (doc: unknown) => boolean;
  setStatus: (status: string | null) => void;
}): { handleSave: () => Promise<void>; handleLoad: () => Promise<void> } {
  const { editorStateRef, loadDocFromJson, setStatus } = opts;
  const filePartsRef = useRef<FileParts>({ meta: null, foreign: {} });

  /**
   * Save: wrap the current document in a versioned envelope
   * (FileFormat.spec.md §6) and hand it to `browser-fs-access.fileSave`,
   * which uses the native File System Access API save picker in Chromium
   * and falls back to an `<a download>` download in Firefox/Safari.
   * Preserved meta and foreign members from the last successful load
   * re-emit verbatim; the fresh generator merges into preserved meta (§3).
   * `AbortError` (user dismissed the picker) is silent; any other error
   * surfaces on the status line. Pinned by `e2e/file-io.spec.ts`.
   */
  const handleSave = useCallback(async () => {
    try {
      setStatus(null);
      const { meta, foreign } = filePartsRef.current;
      const envelope = encodeEnvelope(editorStateRef.current.doc.toJSON(), {
        generator: GENERATOR,
        ...(meta !== null ? { meta } : {}),
        foreign,
      });
      const json = JSON.stringify(envelope, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      await fileSave(blob, {
        fileName: 'document.mn.json',
        extensions: ['.mn.json'],
        mimeTypes: ['application/json'],
        description: 'Metanorma document',
      });
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setStatus(`Could not save: ${(err as Error).message}`);
    }
  }, [editorStateRef, setStatus]);

  /**
   * Open: prompt for a `.mn.json` / `.json` file via `browser-fs-access`,
   * read it as text, parse, decode through the §5 read chain (FileFormat
   * error taxonomy and legacy bare trees included), and rehydrate the bare
   * tree. One try/catch wraps the whole pipeline, so parse errors, the
   * taxonomy, and the post-decode structural `RangeError` all funnel to a
   * single status-line message. Cancellation (`AbortError`) is silent.
   *
   * The session ref is assigned strictly AFTER rehydration returns:
   * `decodeEnvelope`'s doc check is shape-only, so a valid-envelope file
   * with a structurally invalid tree (unknown node type — the stock
   * `RangeError` contract, schema.spec.md §12 item 5) decodes fine and
   * throws at rehydration; assigning the ref first would stamp the failed
   * file's meta/foreign onto the previous document's next save.
   * `loadDocFromJson` returns true or throws, so control flow alone guards
   * the assignment, and a failed load leaves the ref at the previous
   * file's parts — which matches the editor still showing that document.
   * Pinned by `e2e/file-io.spec.ts`.
   */
  const handleLoad = useCallback(async () => {
    try {
      setStatus(null);
      const file = await fileOpen({
        extensions: ['.mn.json', '.json'],
        description: 'Metanorma document',
      });
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const decoded = await decodeEnvelope(parsed);
      loadDocFromJson(decoded.tree);
      filePartsRef.current = { meta: decoded.meta, foreign: decoded.foreign };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      const msg = (err as Error)?.message ?? String(err);
      setStatus(`Could not load file: ${msg}`);
    }
  }, [loadDocFromJson, setStatus]);

  return { handleSave, handleLoad };
}
