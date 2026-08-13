/**
 * `insertImage` — insert a `figure > image` at the current selection
 * (images-figures.md §6).
 *
 * Validates the resolved `src` via `assertValidImageAttrs`, materialises the
 * `figure > image` subtree, and selects the figure. The command takes
 * already-resolved `{ src, alt }` and is synchronous — no `EditorView`, no DOM,
 * no async. The adapter layer in `@metanorma/toolbar` owns the `EditorView`,
 * async upload/URL resolution, and focus.
 *
 * Conforms to the Command contract (AdvancedMetanormaToolbar/README.md §6.2;
 * §1.5).
 */

import { NodeSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';

import { assertValidImageAttrs } from '@metanorma/prosemirror-schema';

import { generateId } from '../util.js';


/**
 * Attributes gathered by the adapter (dialog / prompt).
 * `src` must be non-empty.
 */
export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
}

/**
 * Validate that a figure may be inserted at the current selection
 * (images-figures.md §6.3, §8.2).
 *
 * Because `figure` is a `block`, validity depends on an ancestor that holds
 * blocks, not on `$from.parent` (which is usually a paragraph). Walks up the
 * resolution and asks each ancestor whether the figure can occupy a child slot.
 */
export function canInsertFigure(state: EditorState): boolean {
  const figureType = state.schema.nodes['figure'];
  if (figureType === undefined) return false;
  const { $from, $to } = state.selection;
  // v1: cursor / single-block only.
  if (!$from.sameParent($to)) return false;
  for (let d = $from.depth; d >= 0; d--) {
    const ancestor = $from.node(d);
    const index = $from.indexAfter(d);
    if (ancestor.canReplaceWith(index, index, figureType)) return true;
  }
  return false;
}

/**
 * Insert a `figure > image` at the current selection and select the figure
 * (images-figures.md §6).
 *
 * @returns `true` iff a transaction was dispatched; `false` if `src` was
 *          invalid or insertion was not legal at the current selection.
 */
export function insertImage(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  attrs?: InsertImageAttrs,
): boolean {
  // 1. Applicability check (runs in BOTH query and dispatch forms).
  if (!canInsertFigure(state)) return false;

  // 2. Query form: no dispatch ⇒ pure predicate, mutate nothing.
  if (dispatch === undefined) return true;

  // 3. Validate src via the throwing guard, wrapped to return false
  // (§6.2 step 3).
  let src: string;
  try {
    assertValidImageAttrs({ src: attrs?.src });
    src = attrs!.src; // narrowed by the assert above
  } catch {
    return false; // src missing / empty / wrong type
  }

  // 4. Build figure > image, resolving types through state.schema.
  const schema = state.schema;
  const imageType = schema.nodes['image'];
  const figureType = schema.nodes['figure'];
  if (imageType === undefined || figureType === undefined) return false;
  const image = imageType.create({ src, alt: attrs!.alt ?? null });
  // figure attrs: id is generated for cross-referencing;
  // number/title/data default.
  const figure = figureType.create({ id: generateId() }, [image]);

  // 5. Insert + select the figure. ONE transaction.
  const tr = state.tr.replaceSelectionWith(figure);

  // replaceSelectionWith on a content-bearing block leaves the selection just
  // past it; the figure starts at (selection.from - nodeSize).
  const figPos = tr.selection.from - figure.nodeSize;
  tr.setSelection(NodeSelection.create(tr.doc, figPos));

  // 6. scrollIntoView (user-initiated) + dispatch EXACTLY ONCE.
  // No view.focus().
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
