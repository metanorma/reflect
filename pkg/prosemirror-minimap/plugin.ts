/**
 * `createMinimap()` — the ProseMirror plugin — and the view-keyed
 * controller registry (§7.1).
 *
 * The plugin has two halves: a view plugin (`MinimapController`) owning
 * the mutable block model, and the scroll-container contract (§7.1). The
 * plugin keeps no editor state, so there is no public `PluginKey` export
 * (§13).
 *
 * Transaction capture (§7.2): a ProseMirror view plugin's `update(view,
 * prevState)` does not receive the transaction, and `state.tr` is a
 * *factory* — every read constructs a fresh, empty `Transaction`, never
 * the one that produced the state. The transaction is therefore captured
 * by a state-slot plugin (`apply` records the incoming transaction's
 * structural slice into `trSlot`) and handed to the view plugin on the
 * next `update`. The slot is written on every `apply` and read once; a
 * null slot means "no new transaction since the last read" (e.g. the
 * first `update` after plugin init).
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { MinimapController } from './controller.js';
import type { MinimapOptions, MinimapTr, MinimapView } from './types.js';


/** View-keyed controller registry (§7.1): one live controller per view. */
const registry = new WeakMap<MinimapView, MinimapController>();

/**
 * The plugin's internal key — the state-slot bookkeeping and the view
 * plugin share it. Not exported (§13): the plugin keeps no public state.
 */
const minimapKey: PluginKey<TrSlot | null> = new PluginKey<TrSlot | null>(
  'minimap',
);

/** The captured transaction's structural slice (see the module note). */
interface TrSlot {
  tr: Transaction;
}

/**
 * The `MinimapTr` slice of a real `Transaction`: what the controller
 * consumes (§7.2).
 */
function structural(tr: Transaction): MinimapTr {
  return {
    docChanged: tr.docChanged,
    doc: tr.doc,
    mapping: tr.mapping,
  };
}

/**
 * Resolve the live controller for `view`, or `null` when the plugin is
 * not installed (§7.1). A second `Minimap` component bound to the same
 * view shares the controller.
 */
export function getMinimapController(
  view: MinimapView,
): MinimapController | null {
  return registry.get(view) ?? null;
}

/**
 * Create the minimap plugin (§7.1). Observes transactions and the scroll
 * container; the rendering component (`react.tsx`) mounts separately and
 * reads the controller through `getMinimapController`.
 */
export function createMinimap(options?: MinimapOptions): Plugin {
  const opts: MinimapOptions = options ?? {};
  return new Plugin({
    key: minimapKey,
    // The transaction-capture half (§7.2): `apply` sees every transaction
    // on its way into editor state.
    state: {
      init: () => null,
      apply(tr, _prev): TrSlot | null {
        void _prev;
        return { tr };
      },
    },
    view(editorView) {
      const view: EditorView = editorView;
      const controller = new MinimapController(view, opts);
      registry.set(view, controller);
      controller.start();
      return {
        update: (v, prevState) => {
          const next = v.state;
          const slot = minimapKey.getState(next) ?? null;
          const prevSlot = minimapKey.getState(prevState) ?? null;
          // A fresh transaction since the last update — the captured one.
          const tr: MinimapTr | null = slot !== null && slot !== prevSlot
            ? structural(slot.tr)
            : null;
          controller.update(
            v.state,
            tr,
          );
        },
        destroy: () => {
          registry.delete(view);
          controller.destroy();
        },
      };
    },
  });
}
