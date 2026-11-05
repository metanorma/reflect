/**
 * `imageNaturalSizePlugin` — idle backfill of the editor-only
 * `x-natural-width`/`x-natural-height` attrs (§6 rule 5 declaration,
 * MetanormaProseMirror.spec.md §6.3).
 *
 * Why a view plugin: the DOM clipboard drops `x-*` attrs (§6 rule 5 — they
 * are never named in `toDOM`/`parseDOM`), so pasted images arrive with both
 * attrs null, and inserted images whose commit-time capture failed are null
 * too. The re-derivation is async (decode), so the mechanism is an
 * **idle-scheduled ProseMirror view plugin** — the shape that exists for
 * exactly this kind of deferred, async, side-effecting work.
 *
 * Scope (deliberate):
 * - **Data-URI `src`s only** — locally decodable. Remote-URL images are
 *   NEVER backfilled: the plugin performs no editor-initiated network
 *   fetches. Opening a legacy document triggers no wholesale migration
 *   sweep; backfill is per-node, only-if-null, as nodes are observed.
 * - **Failure memo (poison-pill guard)**: a failed decode leaves the attrs
 *   null and the `src` a data URI, so without a memo every idle pass would
 *   re-attempt a permanently corrupt image forever — a transaction-less but
 *   recurring cost. Failed decodes AND ≤0 natural-size resolutions (SVG
 *   without intrinsic size — the result cannot change for the same bytes)
 *   are memoized per `src` in plugin-instance state (never persisted); a
 *   corrupt data URI costs exactly one attempt.
 * - **Dispatch-time safety** (the dialog's async-dispatch rules, inherited):
 *   the pass decodes asynchronously and the document can shift underneath
 *   it, so dispatch never trusts schedule-time positions — targets are
 *   re-found in the LIVE `view.state` (rescan by `src`, not stale `pos`)
 *   and only-if-null is rechecked against the live node. A target that
 *   moved, was deleted, or was filled meanwhile is silently skipped.
 * - **History-invisible**: a backfill transaction's visible effect is nil,
 *   so it carries `setMeta('addToHistory', false)` — backfilled attrs never
 *   surface as undo steps yet still persist in the document. The no-dispatch
 *   case (healthy docs, memoized or skipped targets) is trivially clean.
 *
 * The plugin draws nothing — `plugin-smoke.spec.ts` is not its vehicle
 * (that suite's header scopes it to render verification); the dispatch
 * behavior is verified by the editor-gui figures e2e.
 */

import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

/** The attrs this plugin backfills, and their `<img>` source properties. */
const AXES = [
  { attr: 'x-natural-width', natural: 'naturalWidth' },
  { attr: 'x-natural-height', natural: 'naturalHeight' },
] as const;

/**
 * Pure decision helper (exported for headless testing): an `image` node
 * needs backfill iff at least one `x-natural-*` attr is null and `src` is a
 * data URI (locally decodable — remote URLs are out of scope by policy, and
 * the plugin performs no network fetches). The failure memo is plugin
 * instance state, consulted around this helper, not inside it.
 */
export function needsNaturalSizeBackfill(node: Node): boolean {
  if (node.type.name !== 'image') return false;
  if (
    node.attrs['x-natural-width'] !== null &&
    node.attrs['x-natural-height'] !== null
  ) {
    return false;
  }
  const src = node.attrs['src'];
  return typeof src === 'string' && src.startsWith('data:');
}

/** Decode a data URI locally; resolves to nulls on failure or ≤0 size. */
function decodeDataUriSize(
  src: string,
): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth > 0 ? img.naturalWidth : null,
        height: img.naturalHeight > 0 ? img.naturalHeight : null,
      });
    };
    img.onerror = () => resolve({ width: null, height: null });
    img.src = src;
  });
}

/**
 * Build the plugin. Plugin-instance state (the failure/empty memo and the
 * schedule flag) lives in this closure — created once per `imageNaturalSizePlugin()`
 * call, never persisted.
 */
export function imageNaturalSizePlugin(): Plugin {
  /** `src`s resolved to nothing (decode failure or ≤0 natural size) — skip
   * forever; the bytes are in the URI, so the result cannot change. */
  const resolvedEmpty = new Set<string>();
  let scheduled = false;

  const scheduleIdle = (run: () => void) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 200);
    }
  };

  const schedulePass = (view: EditorView) => {
    if (scheduled || view.isDestroyed) return;
    scheduled = true;
    scheduleIdle(() => {
      scheduled = false;
      if (view.isDestroyed) return;
      void runPass(view);
    });
  };

  const runPass = async (view: EditorView): Promise<void> => {
    // 1. Collect candidate srcs from the CURRENT state (schedule time).
    const candidates = new Set<string>();
    view.state.doc.descendants((node) => {
      if (node.type.name !== 'image') return true;
      if (!needsNaturalSizeBackfill(node)) return true;
      const src = node.attrs['src'] as string;
      if (!resolvedEmpty.has(src)) {
        candidates.add(src);
      }
      return true;
    });
    if (candidates.size === 0) return;

    // 2. Decode (async — the document may shift underneath).
    const decoded = new Map<string, { width: number | null; height: number | null }>();
    await Promise.all(
      [...candidates].map(async (src) => {
        const size = await decodeDataUriSize(src);
        if (size.width === null && size.height === null) {
          resolvedEmpty.add(src); // poison-pill guard: never re-attempt
          return;
        }
        decoded.set(src, size);
      }),
    );
    if (decoded.size === 0 || view.isDestroyed) return;

    // 3. Re-find targets in the LIVE state and dispatch one transaction,
    //    only-if-null per axis (inherited dispatch-time safety rules).
    let tr = view.state.tr;
    let changed = false;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image') return true;
      const src = node.attrs['src'];
      if (typeof src !== 'string' || !decoded.has(src)) return true;
      const size = decoded.get(src)!;
      for (const axis of AXES) {
        if (node.attrs[axis.attr] !== null) continue; // only-if-null, live
        const value = size[axis.natural === 'naturalWidth' ? 'width' : 'height'];
        if (value === null) continue; // e.g. SVG: width resolvable, height not
        tr = tr.setNodeAttribute(pos, axis.attr, value);
        changed = true;
      }
      return true;
    });
    if (!changed) return;
    // History-invisible: nil visible effect, never an undo step.
    view.dispatch(tr.setMeta('addToHistory', false));
  };

  return new Plugin({
    view(initView) {
      schedulePass(initView);
      return {
        update(view) {
          schedulePass(view);
        },
      };
    },
  });
}
