/**
 * Figure/image insertion commands (images-figures.md §6).
 *
 * Two-stage authoring, mirroring the schema (`image` is ungrouped and
 * reachable only inside `figure`):
 *
 * - `insertFigure` — create a `figure > [figure_name]` at the current
 *   selection (seeded empty caption, generated id), cursor in the caption.
 *   Refuses inside any figure (§2.2 — v1 does not author subfigures).
 * - `insertImageIntoFigure` — add the `image` atom to the nearest enclosing
 *   figure without one, **immediately after its `figure_name` child** (§2.1:
 *   the only position valid in both the PM schema and Standoc's
 *   single-occurrence `FigureBody` choice group).
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
 * `src` must be non-empty.
 */
export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
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
 * Whether a figure node already contains an `image` child (v1: one image
 * per figure).
 */
function hasImageChild(node: Node): boolean {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type.name === 'image') return true;
  }
  return false;
}

/**
 * The nearest enclosing image-less figure of `$pos`, or `null` (§6.3).
 *
 * Walks outward; the first `figure` ancestor without an `image` child wins.
 * Inside a subfigure that already has an image, the enclosing parent figure
 * (if image-less) is a legal target — the walk continues outward past
 * figure-with-image ancestors.
 */
function targetFigure($pos: ResolvedPos): { node: Node; depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (node.type.name !== 'figure') continue;
    if (hasImageChild(node)) continue;
    return { node, depth: d };
  }
  return null;
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
 * Insert an empty `figure > [figure_name]` at the current selection and
 * place the cursor in the caption (images-figures.md §6.2).
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
 * True when the selection sits inside (or node-selects) a figure with no
 * `image` child — the nearest such ancestor (images-figures.md §6.3, §8.3).
 *
 * Serves first-fill (the caret is in the caption after `insertFigure`) and
 * post-deletion recovery (figure > [figure_name] after the image atom is
 * deleted). Plugs into `useEditorStateSelector`.
 */
export function canInsertImageIntoFigure(state: EditorState): boolean {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'figure') {
    return !hasImageChild(sel.node);
  }
  return targetFigure(sel.$from) !== null;
}

/**
 * Insert an `image` atom into the figure at (or enclosing) the current
 * selection, immediately after its `figure_name` child (images-figures.md
 * §6.4).
 *
 * @returns `true` iff a transaction was dispatched; `false` if `src` was
 *          invalid or no image-less figure encloses the selection.
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

  // 3. Validate src via the throwing guard, wrapped to return false
  // (§6.4 step 3).
  let src: string;
  try {
    assertValidImageAttrs({ src: attrs?.src });
    src = attrs!.src; // narrowed by the assert above
  } catch {
    return false; // src missing / empty / wrong type
  }

  // 4. Resolve the target figure and its start position (re-run against the
  // passed state — the adapter may dispatch after an async upload, so the
  // selection may have moved since the dialog was opened).
  const schema = state.schema;
  const imageType = schema.nodes['image'];
  if (imageType === undefined) return false;

  const sel = state.selection;
  let figStart: number;
  let captionSize: number;
  if (sel instanceof NodeSelection && sel.node.type.name === 'figure') {
    figStart = sel.from;
    captionSize = captionNodeSize(sel.node);
  } else {
    const target = targetFigure(sel.$from);
    if (target === null) return false;
    figStart = sel.$from.before(target.depth);
    captionSize = captionNodeSize(target.node);
  }

  // 5. Insert immediately after the figure_name child (§2.1): given Standoc's
  // single-occurrence FigureBody choice group (image XOR paragraphs XOR
  // subfigures), the slot after the caption is the only position valid in
  // both models, and it is immune to trailing content the figure has
  // accumulated (notes, paragraphs — the exitName residue).
  const image = imageType.create({ src, alt: attrs!.alt ?? null });
  const tr = state.tr.insert(figStart + 1 + captionSize, image);

  // 6. The selection is left unchanged (the cursor stays with the author,
  // e.g. in the caption). scrollIntoView + dispatch EXACTLY ONCE.
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * Size of the figure's `figure_name` first child, or 0 when the figure has
 * no caption (a parsed/imported figure).
 */
function captionNodeSize(figure: Node): number {
  const first = figure.firstChild;
  if (first !== null && first.type.name === 'figure_name') {
    return first.nodeSize;
  }
  return 0;
}
