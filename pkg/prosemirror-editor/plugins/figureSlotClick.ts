/**
 * `figureSlotClickPlugin` — single-click on an EMPTY figure body selects the
 * figure (MetanormaProseMirror.spec.md §6.2; images-figures.md §12).
 *
 * The empty-figure placeholder ("Empty figure") is a CSS `::after` on the
 * `<figure>` element — no DOM node of its own — so a click on the dashed box
 * falls through to the figure element, where ProseMirror's click handling
 * lands the caret in the nearest textblock (the caption). That leaves the
 * figure's body slot itself unreachable by mouse: the author cannot select
 * the figure to target it.
 *
 * On a plain left-click whose target is the figure's own region (not inside
 * any of its textblocks) and whose figure's body slot is EMPTY, the plugin
 * selects the figure node. The hook is `handleClickOn` — it runs inside
 * ProseMirror's click pipeline, after the click's position has been
 * computed (note the argument order in prosemirror-view ≥1.42: `event` is
 * 5th, `direct` 6th), and returning `true` suppresses PM's default caret
 * placement for the click (a `handleDOMEvents.mouseup` dispatch would race
 * PM's own selection handling and lose). Selection chrome arrives through
 * `FigureNodeView`'s class merge (`ProseMirror-selectednode` alongside
 * `mn-figure`).
 *
 * Scope guard: fires ONLY for empty-slot figures — figures with a body
 * branch (image / paragraph run / subfigure run) keep stock click behaviour
 * (caret into textblocks, node-selection on atoms).
 */

import { Plugin, PluginKey, NodeSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";

import { CLASS } from "@metanorma/prosemirror-schema";

/** DOM event target → nearest element (self if already an element). */
function elementOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Node)) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : node.parentElement;
}

/**
 * Whether the figure node's body slot is empty: no children beyond the
 * optional `figure_name` caption (schema §8.6 — the seeded / recovery
 * state, exactly the figures the CSS placeholder matches).
 */
function bodySlotIsEmpty(figure: PMNode): boolean {
  const first = figure.firstChild;
  if (first === null) return true;
  if (first.type.name === "figure_name") return figure.childCount === 1;
  return false;
}

/**
 * The figure-slot click plugin. See module doc.
 */
export function figureSlotClickPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("figureSlotClick"),
    props: {
      handleClickOn: (
        view, _pos, _node, _nodePos, rawEvent, _direct,
      ): boolean => {
        const event = rawEvent as MouseEvent;
        // Plain left-click only — no modifiers (shift-click extends,
        // alt/ctrl/meta select nodes) and no multi-click (double-click word
        // selection, triple-click already node-selects).
        if (event.button !== 0 || event.shiftKey || event.altKey
          || event.ctrlKey || event.metaKey) return false;
        if (event.detail !== 1) return false;

        const el = elementOf(event.target);
        if (el === null || !view.dom.contains(el)) return false;

        // The click must be on the figure's own region, not inside one of
        // its textblocks (caption, body paragraph) — those keep PM's caret
        // placement (and the placeholderClick normalization).
        const figureEl = el.closest(`figure.${CLASS.figure}`);
        if (figureEl === null || !view.dom.contains(figureEl)) return false;
        if (el !== figureEl
          && el.closest("p, pre, figcaption") !== null) return false;

        // Map the clicked figure element to its doc node. posAtDOM never
        // depends on hit-testing pseudo-elements.
        let pos: number;
        try {
          pos = view.posAtDOM(figureEl, 0);
        } catch {
          return false;
        }
        const $pos = view.state.doc.resolve(Math.max(0, pos));
        let figureDepth = -1;
        for (let d = $pos.depth; d >= 1; d--) {
          if ($pos.node(d).type.name === "figure") { figureDepth = d; break; }
        }
        if (figureDepth === -1) return false;
        const figure = $pos.node(figureDepth);
        if (!bodySlotIsEmpty(figure)) return false;

        // Already node-selected → let the default handling be (no-op).
        const sel = view.state.selection;
        if (sel instanceof NodeSelection && sel.node === figure) return false;

        view.dispatch(view.state.tr.setSelection(
          NodeSelection.create(view.state.doc, $pos.before(figureDepth)),
        ));
        return true; // our selection stands; suppress PM's caret placement
      },
    },
  });
}
