/**
 * `placeholderClickPlugin` — normalize caret placement for clicks on the
 * styled placeholder of an EMPTY textblock (MetanormaProseMirror.spec.md §9.4).
 *
 * Empty textblocks render only `<br class="ProseMirror-trailingBreak">` plus
 * the CSS `::before` placeholder (`document.css`). Clicks landing on the
 * placeholder glyphs hit a PSEUDO-ELEMENT region: there is no text node to
 * hit-test. Firefox (verified 153) produces no caret position for such clicks
 * when focus was elsewhere — neither the browser's native caret move nor
 * ProseMirror's coordinate-based selection path places the selection, so the
 * caret silently stays where it was and typing goes to the wrong block.
 * Chromium mostly works but has narrow dead zones at the line edges.
 *
 * The fix is engine-independent: on a plain left-click whose target is inside
 * an empty textblock, ensure the selection sits inside that textblock. The
 * check runs at MOUSEUP, after ProseMirror's own mouse pipeline has finished
 * (dispatching inside mousedown fights LeftMouseDown's native-caret path and
 * races React-controlled state updates — it collapsed shift-selections in
 * testing). By mouseup time PM has either placed a selection (then this is a
 * no-op) or left the stale one (the Firefox case — then this corrects it).
 *
 * Returning `false` from the handler keeps PM's mouse handling fully intact
 * (double-click word selection, shift-extend, drag): the handler only adds a
 * correction transaction when the final selection is not already inside the
 * clicked empty textblock.
 */

import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { Node as PMNode, Mark as PMMark } from "prosemirror-model";

/**
 * Minimal structural view type.
 *
 * Not `EditorView`: this repo's PnP graph resolves `prosemirror-view` 1.42.0
 * (pinned direct dep) and 1.42.1 (`prosemirror-state`'s peer range) as
 * SEPARATE instances, so `EditorView` types are nominally incompatible across
 * package boundaries. The plugin only needs `dom`, `posAtDOM`, `state`, and
 * `dispatch` — all present on both.
 */
interface ViewLike {
  readonly dom: HTMLElement;
  readonly state: {
    readonly doc: PMNode;
    readonly selection: import("prosemirror-state").Selection;
    readonly storedMarks: PMMark[] | null;
    readonly tr: import("prosemirror-state").Transaction;
  };
  posAtDOM(node: Node, offset: number): number;
  dispatch(tr: unknown): void;
}

/** DOM event target → nearest element (self if already an element). */
function elementOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Node)) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : node.parentElement;
}

/**
 * If the click target sits inside an EMPTY textblock (zero inline content —
 * the state that shows the CSS placeholder), return its caret position.
 * `null` otherwise.
 */
function emptyTextblockPos(view: ViewLike, target: EventTarget | null): number | null {
  const el = elementOf(target);
  if (el === null || !view.dom.contains(el)) return null;

  // Map the clicked element to a doc position through the public API, then
  // resolve the enclosing textblock. posAtDOM never depends on hit-testing
  // pseudo-elements, so this works where posAtCoords cannot.
  let pos: number;
  try {
    pos = view.posAtDOM(el, 0);
  } catch {
    // posAtDOM throws on boundary nodes outside the doc view.
    return null;
  }

  const $pos = view.state.doc.resolve(pos);
  const node: PMNode | null = $pos.node($pos.depth);
  if (node === null || !node.isTextblock || node.content.size > 0) return null;
  return $pos.before($pos.depth) + 1;
}

/**
 * The placeholder-click normalization plugin. See module doc.
 */
export function placeholderClickPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("placeholderClick"),
    props: {
      handleDOMEvents: {
        mouseup: (view, event): boolean => {
          const mouse = event as MouseEvent;
          // Plain left-click only — no modifiers (shift-click extends,
          // alt/ctrl/meta select nodes) and no drag (moved >4px selects a
          // range; repositioning would destroy it).
          if (mouse.button !== 0 || mouse.shiftKey || mouse.altKey
            || mouse.ctrlKey || mouse.metaKey) return false;
          if ((event as MouseEvent & { detail?: number }).detail !== 1) return false;

          const v = view as unknown as ViewLike;
          const pos = emptyTextblockPos(v, mouse.target);
          if (pos === null) return false;

          // Already inside the clicked textblock → nothing to correct.
          const sel = v.state.selection;
          if (sel instanceof TextSelection && !sel.empty) return false;
          const $cur = v.state.doc.resolve(sel.from);
          const $want = v.state.doc.resolve(pos);
          if ($cur.parent === $want.parent) return false;

          const tr = v.state.tr.setSelection(TextSelection.create(v.state.doc, pos));
          // setSelection nulls storedMarks; carry them over explicitly so a
          // pending mark (e.g. Bold awaiting the next typed character)
          // survives the click.
          if (v.state.storedMarks !== null) {
            tr.setStoredMarks(v.state.storedMarks);
          }
          v.dispatch(tr);
          return false;
        },
      },
    },
  });
}
