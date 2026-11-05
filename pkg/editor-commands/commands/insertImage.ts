/**
 * Figure/image insertion commands (images-figures.md §6).
 *
 * Two-stage authoring over the figure's **typed body slot** (schema §8.6:
 * `figure_name? (image | paragraph+ | figure+)?` — the Standoc `FigureBody`
 * XOR, enforced by the schema):
 *
 * - `insertFigure` — create a `figure > [figure_name]` at the current
 *   selection (seeded empty caption, generated id), cursor in the caption.
 *   Refuses inside any figure (§2.2 — v1 does not author subfigures).
 * - `insertImageIntoFigure` — fill/replace the body SLOT of the nearest
 *   enclosing figure, in ONE step: `replaceRangeWith` over the entire body
 *   range (everything after `figure_name`). Never inserts beside existing
 *   children — under the XOR expression, caret-relative insertion is silently
 *   re-homed into new sibling figures by ProseMirror's replace fitting (the
 *   `figureSlot` regression tests lock this in), so whole-slot replacement is
 *   the only sound insertion shape.
 *
 * Slot verdicts (§6.3):
 * - `fill` — body empty (fresh `insertFigure`, or image deleted): the image
 *   becomes the body.
 * - `replace` — body is a paragraph run: the run is REPLACED by the image
 *   (silent, undoable — the text-branch-to-image transition).
 * - refuse — body already holds an `image` (one-image rule: delete it first)
 *   or a `figure+` run (subfigures are never destroyed by a fill).
 *
 * Both conform to the Command contract (AdvancedMetanormaToolbar/README.md
 * §6.2; EditorCommands.spec.md §1.5): pure `(state, dispatch?) => boolean`,
 * no `EditorView`, no DOM, no async. The adapter layer in `@metanorma/toolbar`
 * owns the `EditorView`, async upload/URL resolution, and focus.
 */

import { TextSelection, NodeSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { ResolvedPos, Node } from 'prosemirror-model';

import { assertValidImageAttrs } from '@metanorma/prosemirror-schema';

import { generateId, canInsertBlockAdjacent } from '../util.js';


/**
 * Attributes gathered by the adapter (dialog / prompt).
 * `src` must be non-empty; `mimetype` is an **insertion precondition**
 * (§17.4): a non-null string, satisfied by construction because the adapter
 * always runs `inferMimetype` (total) before dispatching. Legacy/imported
 * documents may legitimately carry `mimetype: null` — that is a load-path
 * concern, not this command's.
 */
export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
  /** Inferred mimetype (§17.4) — the marker (`UNKNOWN_MIMETYPE`) is a valid
   * value here; export-time inference may later replace it. */
  readonly mimetype?: string;
  /** Intrinsic geometry captured at commit (§6 rule 5) — null on decode
   * failure or non-positive natural size (SVG without intrinsic size). */
  readonly xNaturalWidth?: number | null;
  readonly xNaturalHeight?: number | null;
}

/**
 * Whether the cursor sits inside a `figure` (any ancestor is one).
 */
function insideFigure($from: ResolvedPos): boolean {
  for (let d = $from.depth; d >= 1; d--) {
    if ($from.node(d).type.name === 'figure') return true;
  }
  return false;
}

/**
 * The resolved slot target for an image fill (§6.3): the nearest enclosing
 * figure (or the node-selected figure), its body range (everything after
 * the optional `figure_name` first child), and the verdict. `null` when no
 * figure encloses the selection or the verdict is refuse.
 *
 * The nearest figure alone decides — no outward walk. Filling past a filled
 * subfigure would mean replacing the parent's `figure+` run (destroying the
 * subfigure), which §6.3 refuses.
 */
interface FigureSlot {
  readonly node: Node;
  /** Figure node start position. */
  readonly start: number;
  /** Body content range: [bodyFrom, bodyTo) — everything after `figure_name`. */
  readonly bodyFrom: number;
  readonly bodyTo: number;
  readonly verdict: 'fill' | 'replace';
  /** `true` when the first child is a `figure_name` caption. */
  readonly hasCaption: boolean;
}

function figureSlot(state: EditorState): FigureSlot | null {
  const sel = state.selection;
  let figure: Node;
  let start: number;
  if (sel instanceof NodeSelection && sel.node.type.name === 'figure') {
    figure = sel.node;
    start = sel.from;
  } else {
    let depth = -1;
    for (let d = sel.$from.depth; d >= 1; d--) {
      if (sel.$from.node(d).type.name === 'figure') { depth = d; break; }
    }
    if (depth === -1) return null;
    figure = sel.$from.node(depth);
    start = sel.$from.before(depth);
  }

  const first = figure.firstChild;
  let captionSize = 0;
  if (first !== null && first.type.name === 'figure_name') {
    captionSize = first.nodeSize;
  }
  const hasCaption = captionSize > 0;
  const bodyFrom = start + 1 + captionSize;
  const bodyTo = start + figure.nodeSize - 1;
  const firstBodyIndex = hasCaption ? 1 : 0;

  if (figure.childCount === firstBodyIndex) {
    return { node: figure, start, bodyFrom, bodyTo, verdict: 'fill', hasCaption };
  }
  // Non-empty body: only the paragraph run is replaceable (silent, undoable).
  // An image present → refuse (one-image rule, §6.3); a `figure+` run →
  // refuse (subfigure destruction); mixed branches cannot occur (schema XOR).
  for (let i = firstBodyIndex; i < figure.childCount; i++) {
    if (figure.child(i).type.name !== 'paragraph') return null;
  }
  return { node: figure, start, bodyFrom, bodyTo, verdict: 'replace', hasCaption };
}

/**
 * Validate that a top-level figure may be inserted at the current selection
 * (images-figures.md §6.2, §8.2).
 *
 * Because `figure` is a `block`, validity depends on the parent that holds
 * blocks, not on `$from.parent` (which is usually a paragraph). Asks whether
 * a figure can occupy the slot immediately after the cursor's textblock. The
 * textblock must be body content — not a `section_title` heading, not a
 * caption (`bodyBlockContext` excludes both) — and no ancestor may be a
 * `figure` (§2.2 nesting refusal: v1 does not author subfigures; imported
 * nested figures remain valid documents, they are just not created here).
 */
export function canInsertFigure(state: EditorState): boolean {
  const figureType = state.schema.nodes['figure'];
  if (figureType === undefined) return false;
  const { $from, $to } = state.selection;
  // v1: cursor / single-block only; refuse inside any figure.
  if (!$from.sameParent($to)) return false;
  if (insideFigure($from)) return false;
  return canInsertBlockAdjacent(state, figureType);
}

/**
 * Insert an empty `figure > [figure_name]` at the current selection and place
 * the cursor in the caption (images-figures.md §6.2).
 *
 * @returns `true` iff a transaction was dispatched; `false` if insertion
 *          was not legal at the current selection.
 */
export function insertFigure(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  // 1. Applicability check (runs in BOTH query and dispatch forms).
  if (!canInsertFigure(state)) return false;

  // 2. Query form: no dispatch ⇒ pure predicate, mutate nothing.
  if (dispatch === undefined) return true;

  // 3. Build figure > [figure_name], resolving types through state.schema.
  // The caption is seeded empty (§6.2 step 5): the author types it first;
  // Enter (`exitName`) moves on. The figure carries a generated id for
  // cross-referencing; number/data default.
  const schema = state.schema;
  const figureType = schema.nodes['figure'];
  const nameType = schema.nodes['figure_name'];
  if (figureType === undefined || nameType === undefined) return false;
  const figure = figureType.create({ id: generateId() }, [nameType.create()]);

  // 4. Insert + place the cursor in the seeded caption. ONE transaction.
  const tr = state.tr.replaceSelectionWith(figure);

  // Locate the inserted figure by its generated id — the position depends on
  // whether replaceSelectionWith replaced an empty textblock wholesale or
  // split a non-empty one at the caret, so selection arithmetic is unreliable
  // (same hazard as insertTable).
  const figureId = figure.attrs['id'];
  let figPos = -1;
  tr.doc.descendants((n, p) => {
    if (figPos !== -1) return false;
    if (n.type === figureType && n.attrs['id'] === figureId) {
      figPos = p;
      return false;
    }
    return true;
  });
  if (figPos !== -1) {
    const captionPos = figPos + 2; // figure open + figure_name open
    tr.setSelection(TextSelection.near(tr.doc.resolve(captionPos), 1));
  }

  // 5. scrollIntoView (user-initiated) + dispatch EXACTLY ONCE.
  // No view.focus().
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * True when the selection sits inside (or node-selects) a figure whose body
 * slot an image may fill or replace — the nearest enclosing figure, empty
 * body (`fill`) or paragraph run (`replace`), per §6.3.
 *
 * Serves first-fill (the caret is in the caption after `insertFigure`) and
 * post-deletion recovery (figure > [figure_name] after the image atom is
 * deleted). Refused inside a figure that already holds an image (one-image
 * rule) or a `figure+` subfigure run. Plugs into `useEditorStateSelector`.
 */
export function canInsertImageIntoFigure(state: EditorState): boolean {
  return figureSlot(state) !== null;
}

/**
 * Fill or replace the body slot of the figure at (or enclosing) the current
 * selection with an `image` atom (images-figures.md §6.4): ONE
 * `replaceRangeWith` over the whole body range — empty body gains the image
 * (`fill`); a paragraph run is silently replaced by it (`replace`, undoable).
 *
 * @returns `true` iff a transaction was dispatched; `false` if `src` was
 *          invalid or no fillable figure encloses the selection.
 */
export function insertImageIntoFigure(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  attrs?: InsertImageAttrs,
): boolean {
  // 1. Applicability check (runs in BOTH query and dispatch forms).
  if (!canInsertImageIntoFigure(state)) return false;

  // 2. Query form: no dispatch ⇒ pure predicate, mutate nothing.
  if (dispatch === undefined) return true;

  // 3. Insertion precondition — a non-null `mimetype` (§17.4), satisfied by
  // construction (the adapter always runs the total `inferMimetype`).
  // Deliberately NOT part of the shape guard `assertValidImageAttrs`
  // (§6.1): presence is an insertion-path requirement, loaded/parsed
  // documents may legitimately carry null. Soft-fail like every other
  // precondition.
  const mimetype = attrs?.mimetype;
  if (typeof mimetype !== 'string' || mimetype === '') return false;

  // 4. Validate src via the throwing guard, wrapped to return false
  // (§6.4 step 3).
  let src: string;
  try {
    assertValidImageAttrs({ src: attrs?.src });
    src = attrs!.src; // narrowed by the assert above
  } catch {
    return false; // src missing / empty / wrong type
  }

  // 5. Resolve the slot (re-run against the passed state — the adapter may
  // dispatch after an async upload, so the selection may have moved since
  // the dialog was opened).
  const schema = state.schema;
  const imageType = schema.nodes['image'];
  if (imageType === undefined) return false;
  const slot = figureSlot(state);
  if (slot === null) return false;

  // 6. Whole-slot replacement (§6.4): the image replaces the ENTIRE body
  // range in one step. Under the XOR expression this is the only insertion
  // shape that never triggers the replace fitter's content preservation
  // (which re-homes displaced paragraphs into new sibling figures).
  const image = imageType.create({
    src,
    alt: attrs!.alt ?? null,
    mimetype,
    'x-natural-width': attrs!.xNaturalWidth ?? null,
    'x-natural-height': attrs!.xNaturalHeight ?? null,
  });
  const tr = state.tr.replaceRangeWith(slot.bodyFrom, slot.bodyTo, image);

  // 7. Selection: set explicitly — the caret may have sat in a body
  // paragraph that no longer exists. With a caption, land at its end; else
  // just after the figure.
  if (slot.hasCaption) {
    const captionEnd = slot.bodyFrom - 1;
    const mapped = tr.mapping.map(captionEnd);
    tr.setSelection(TextSelection.near(tr.doc.resolve(mapped), -1));
  } else {
    const afterFigure = slot.bodyTo + 1;
    const mapped = tr.mapping.map(afterFigure);
    tr.setSelection(TextSelection.near(tr.doc.resolve(mapped), 1));
  }

  // 8. scrollIntoView + dispatch EXACTLY ONCE.
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
