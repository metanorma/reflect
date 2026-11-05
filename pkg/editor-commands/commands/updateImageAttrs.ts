/**
 * Image sizing apply command (images-figures.md §8; schema.spec.md §17.8).
 *
 * `updateImageAttrs` — realized here in **sizing scope** (the name the
 * corpus already used for deferred image editing; src/alt editing remains
 * deferred under the same name). Sets the image's authored size attrs and
 * the enclosing figure's role in **one transaction**, enforcing the
 * role⇔size exclusion the schema cannot express (cross-node, §6.1/§17.8):
 *
 * - choosing a **role** clears numeric size (both axes);
 * - entering a **size** clears the role;
 * - `auto` (explicit nulls) clears size only — the role is untouched.
 *
 * Pure `(state, dispatch?) => boolean` per the Command contract: no
 * `EditorView`, no DOM, no async. The adapter (toolbar popover) owns the
 * view and focus.
 */

import { NodeSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { ResolvedPos, Node } from 'prosemirror-model';

import { assertValidImageAttrs } from '@metanorma/prosemirror-schema';
import type { ImageSizeValue } from '@metanorma/prosemirror-schema';

/** The figure sizing role (schema.spec.md §6.1/§17.8). */
export type FigureRole = 'text-width' | 'full-page-width';

/**
 * A sizing update. Each field is **optional = leave unchanged**; `null`
 * means "clear" (`auto` for size, no-role for the role).
 */
export interface ImageSizingUpdate {
  /** Width: canonical value to set, `null` to clear (auto). */
  readonly width?: ImageSizeValue | null;
  /** Height: canonical value to set, `null` to clear (auto). */
  readonly height?: ImageSizeValue | null;
  /** The figure role to set, `null` to clear. */
  readonly role?: FigureRole | null;
}

/** The figure (with image) a selection targets, with both node positions. */
interface SizingTarget {
  readonly figure: Node;
  readonly figurePos: number;
  readonly image: Node;
  readonly imagePos: number;
}

/** Find the figure-with-image a selection sits in / node-selects. */
function sizingTarget(state: EditorState): SizingTarget | null {
  const findImage = (figure: Node, figurePos: number): SizingTarget | null => {
    let offset = 0;
    for (let i = 0; i < figure.childCount; i++) {
      const child = figure.child(i);
      if (child.type.name === 'image') {
        return { figure, figurePos, image: child, imagePos: figurePos + 1 + offset };
      }
      offset += child.nodeSize;
    }
    return null;
  };

  const sel = state.selection;
  if (sel instanceof NodeSelection) {
    const node = sel.node;
    if (node.type.name === 'image') {
      // The parent of an image is always a figure (ungrouped node, §8.6).
      const $pos = state.doc.resolve(sel.from);
      for (let d = $pos.depth; d >= 1; d--) {
        if ($pos.node(d).type.name === 'figure') {
          return findImage($pos.node(d), $pos.before(d));
        }
      }
      return null;
    }
    if (node.type.name === 'figure') {
      return findImage(node, sel.from);
    }
  }

  const $from: ResolvedPos = sel.$from;
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    if (node.type.name !== 'figure') continue;
    const target = findImage(node, $from.before(d));
    if (target !== null) return target;
  }
  return null;
}

/**
 * Whether the selection targets a figure that contains an image — the
 * popover's enabled predicate (plugs into `useEditorStateSelector`).
 */
export function canUpdateImageAttrs(state: EditorState): boolean {
  return sizingTarget(state) !== null;
}

/**
 * Apply a sizing update to the targeted figure/image in one transaction.
 *
 * @returns `true` iff a transaction was dispatched; `false` if no
 *          figure-with-image is targeted, the update is empty, or a value
 *          fails the shape guard.
 */
export function updateImageAttrs(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  update?: ImageSizingUpdate,
): boolean {
  // 1. Applicability check (both forms).
  const target = sizingTarget(state);
  if (target === null) return false;

  // 2. Query form: pure predicate.
  if (dispatch === undefined) return true;

  // 3. Resolve the update against current attrs, enforcing the exclusion.
  const hasWidth = update?.width !== undefined;
  const hasHeight = update?.height !== undefined;
  const hasRole = update?.role !== undefined;
  if (!hasWidth && !hasHeight && !hasRole) return false; // empty update

  const enteringSize =
    (hasWidth && update?.width != null) || (hasHeight && update?.height != null);
  const choosingRole = hasRole && update?.role != null;

  let width: ImageSizeValue | null = hasWidth ? (update?.width ?? null) : target.image.attrs['width'] as ImageSizeValue | null;
  let height: ImageSizeValue | null = hasHeight ? (update?.height ?? null) : target.image.attrs['height'] as ImageSizeValue | null;
  let role: FigureRole | null = hasRole ? (update?.role ?? null) : target.figure.attrs['width'] as FigureRole | null;

  if (choosingRole) {
    // Choosing a role clears numeric size (both axes).
    width = null;
    height = null;
  }
  if (enteringSize) {
    // Entering a size clears the role. `auto` (explicit nulls) does NOT.
    role = null;
  }

  // 4. Shape-validate the final image attrs (§6.1 guard; throws → soft fail).
  try {
    assertValidImageAttrs({
      src: target.image.attrs['src'],
      width,
      height,
    });
  } catch {
    return false;
  }

  // 5. One transaction: image size + figure role together (§17.8).
  let tr = state.tr
    .setNodeAttribute(target.imagePos, 'width', width)
    .setNodeAttribute(target.imagePos, 'height', height)
    .setNodeAttribute(target.figurePos, 'width', role);
  // No selection change, no insertion — scrollIntoView is unnecessary.
  dispatch(tr);
  return true;
}
