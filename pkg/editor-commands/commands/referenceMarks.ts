/**
 * Reference mark commands (reference-marks.md §6).
 *
 * A generic core command (`applyReferenceMark`) plus per-mark wrappers, plus
 * two inline-atom node-insertion commands (`insertFootnoteMarker`,
 * `insertStem`). All conform to the ProseMirror `Command` contract
 * (`EditorCommands.spec.md` §1.5): pure predicate when queried, single
 * transaction when dispatched. No `EditorView`/DOM.
 */

import type { EditorState, Transaction } from "prosemirror-state";
import { TextSelection, NodeSelection } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";

import { generateId } from "../util.js";

/** Placeholder text inserted into a newly-created `footnote_entry` (§5.5). */
const PLACEHOLDER_TEXT = "Footnote text.";

/** Attribute map for a reference mark (reference-marks.md §6.1). */
type RefAttrs = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Generic core: applyReferenceMark (reference-marks.md §6.1)
// ---------------------------------------------------------------------------

/**
 * Apply or remove a reference mark with attributes over the current selection
 * (reference-marks.md §6.1).
 *
 * - Removes the mark (all attrs) when `attrs` is `null` (caller signals removal).
 * - Otherwise adds the mark with `attrs` over the selection range, first
 *   removing any existing mark of the same type so the new attrs replace it.
 *
 * Conforms to the Command contract: without `dispatch` it is a pure
 * applicability probe; with `dispatch` it dispatches exactly one transaction.
 * Never throws; returns `false` when inapplicable.
 */
export function applyReferenceMark(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  markType: MarkType,
  attrs: RefAttrs | null,
): boolean {
  const { from, to, empty } = state.selection;

  // Query path: with no dispatch, return whether the operation *would* apply.
  // For a removal (attrs === null), it applies iff the mark is currently set.
  // For an add, it applies when there is a selection range to cover.
  if (dispatch === undefined) {
    if (attrs === null) {
      const marks = empty
        ? (state.storedMarks ?? state.selection.$from.marks())
        : state.selection.$to.marks();
      return markType.isInSet(marks) !== undefined;
    }
    return true;
  }

  const tr = state.tr;

  if (attrs === null) {
    // Removal branch.
    if (empty) {
      tr.removeStoredMark(markType);
    } else {
      tr.removeMark(from, to, markType);
    }
  } else {
    // Add branch: clear stale attrs first, then add with the new attrs.
    if (empty) {
      tr.removeStoredMark(markType);
      tr.addStoredMark(markType.create(attrs));
    } else {
      tr.removeMark(from, to, markType);
      tr.addMark(from, to, markType.create(attrs));
    }
  }

  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// Mark-specific wrappers (reference-marks.md §6.2)
// ---------------------------------------------------------------------------

/** Resolve a mark type by name from `state.schema`, returning `null` if absent. */
function resolveMark(state: EditorState, name: string): MarkType | null {
  const mt = state.schema.marks[name];
  return mt ?? null;
}

/**
 * Toggle the `xref` mark with the given `target` (reference-marks.md §6.2).
 * When `target` is `null`, removes the mark.
 */
export function toggleXref(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  target: string | null,
): boolean {
  const mt = resolveMark(state, "xref");
  if (mt === null) return false;
  return applyReferenceMark(state, dispatch, mt, target === null ? null : { target });
}

/** Toggle the `eref` mark with the given `cite` key. `null` removes the mark. */
export function toggleEref(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  cite: string | null,
): boolean {
  const mt = resolveMark(state, "eref");
  if (mt === null) return false;
  return applyReferenceMark(state, dispatch, mt, cite === null ? null : { cite });
}

/**
 * Toggle the `concept` mark with the given `ref` id and `kind` discriminator.
 * `null` ref removes the mark. `kind` (enum `"eref"` | `"xref"` | `"termref"`,
 * default `"xref"`) selects the Presentation-XML child element
 * (`<eref>` / `<xref>` / `<termref>`); see schema.spec.md §17.3 and
 * reference-marks.md §5.3.
 */
export function toggleConcept(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  ref: string | null,
  kind?: "eref" | "xref" | "termref",
): boolean {
  const mt = resolveMark(state, "concept");
  if (mt === null) return false;
  return applyReferenceMark(
    state,
    dispatch,
    mt,
    ref === null ? null : { ref, kind: kind ?? "xref" },
  );
}

/** Toggle the `bcp14` mark with the given `type` keyword. `null` removes the mark. */
export function toggleBcp14(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  type: string | null,
): boolean {
  const mt = resolveMark(state, "bcp14");
  if (mt === null) return false;
  return applyReferenceMark(state, dispatch, mt, type === null ? null : { type });
}

// ---------------------------------------------------------------------------
// Inline atom nodes: footnote_marker, stem (reference-marks.md §5.5, §5.6)
// ---------------------------------------------------------------------------

/**
 * Insert a `footnote_marker` inline node at the selection, optionally creating
 * a `footnote_entry` (and `footnotes` container) in the same transaction
 * (reference-marks.md §5.5).
 *
 * The `target` is the id of the footnote entry the marker points at. If no
 * entry with that id exists, a placeholder entry (and the `footnotes`
 * container if absent) is created in the same transaction.
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if not
 *          applicable (e.g. not in inline content).
 */
export function insertFootnoteMarker(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  target: string,
): boolean {
  const markerType = state.schema.nodes["footnote_marker"];
  if (markerType === undefined) return false;

  // Enabled inside inline content.
  if (!state.selection.$from.parent.type.inlineContent) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const marker = markerType.create({ id: generateId(), target });
  tr.replaceSelectionWith(marker);

  // Ensure a `footnote_entry` with `id === target` exists; create the
  // `footnotes` container + placeholder entry if absent.
  const entryType = state.schema.nodes["footnote_entry"];
  const footnotesType = state.schema.nodes["footnotes"];
  const paragraphType = state.schema.nodes["paragraph"];
  let createdEntry = false; // true when a new entry was created in this tx
  if (entryType !== undefined && footnotesType !== undefined && paragraphType !== undefined) {
    let entryExists = false;
    state.doc.descendants((node) => {
      if (node.type.name === "footnote_entry" && node.attrs["id"] === target) {
        entryExists = true;
        return false;
      }
      return true;
    });
    if (!entryExists) {
      // Find or create the `footnotes` container (last child of doc).
      let footnotesPos = -1;
      let footnotesNode: { readonly type: typeof footnotesType } | null = null;
      for (let i = 0; i < tr.doc.childCount; i++) {
        if (tr.doc.child(i).type.name === "footnotes") {
          footnotesPos = i;
          footnotesNode = tr.doc.child(i) as never;
          break;
        }
      }
      const placeholderText = state.schema.text(PLACEHOLDER_TEXT);
      const placeholder = entryType.create(
        { id: target },
        [paragraphType.create(null, placeholderText)],
      );
      if (footnotesPos < 0) {
        // Create the footnotes container as the last child of doc.
        const container = footnotesType.create({}, [placeholder]);
        tr.insert(tr.doc.content.size, container);
      } else {
        // Append the placeholder entry to the existing container.
        void footnotesNode;
        let pos = 1; // doc open token
        for (let i = 0; i < footnotesPos; i++) {
          pos += tr.doc.child(i).nodeSize;
        }
        // pos is now at the start of the footnotes container node (before its
        // open token). The insertion point for a new last child is at
        // pos + content.size — this lands just before the container's close
        // token, inside the content range.
        const containerNode = tr.doc.child(footnotesPos);
        pos += containerNode.content.size;
        tr.insert(pos, placeholder);
      }
      createdEntry = true;
    }
  }

  if (createdEntry) {
    // Place the cursor inside the new entry's placeholder text, selecting it so
    // the user can immediately type to replace it. Walk tr.doc to find the
    // entry by id, then compute the text range.
    let textStart = -1;
    tr.doc.descendants((node, pos) => {
      if (node.type.name === "footnote_entry" && node.attrs["id"] === target) {
        // pos = entry start (before open token).
        // +1 = entry content start, +1 = paragraph content start (text).
        textStart = pos + 2;
        return false;
      }
      return true;
    });
    if (textStart >= 0) {
      const textEnd = textStart + PLACEHOLDER_TEXT.length;
      const $end = tr.doc.resolve(textEnd);
      if ($end.parent.isTextblock) {
        tr.setSelection(TextSelection.create(tr.doc, textStart, textEnd));
      } else {
        tr.setSelection(TextSelection.near(tr.doc.resolve(textStart)));
      }
    } else {
      tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)));
    }
  } else {
    // Place the cursor after the inserted marker.
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)));
  }
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * Insert a `stem` inline atom node at the selection with the given formula
 * source (reference-marks.md §5.6). The math source is stored in the
 * `asciimath` or `mathml` attr (selected by the `type` discriminator).
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if not
 *          applicable (e.g. not in inline content).
 */
export function insertStem(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  type: "asciimath" | "mathml",
  source: string,
): boolean {
  const stemType = state.schema.nodes["stem"];
  if (stemType === undefined) return false;

  // Enabled inside inline content.
  if (!state.selection.$from.parent.type.inlineContent) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const stem = stemType.create(
    type === "asciimath"
      ? { type, asciimath: source, mathml: null }
      : { type, asciimath: null, mathml: source },
  );
  tr.replaceSelectionWith(stem);

  // Place the cursor after the inserted stem node.
  tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * Remove a `footnote_marker` node from the document (reference-marks.md §7).
 *
 * Applicable only when the selection is a `NodeSelection` on a
 * `footnote_marker` node. Deletes the node but **never** touches its
 * `footnote_entry` — the entry may hold authored content or be referenced by
 * other markers (§5.5).
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if not
 *          applicable (no marker selected).
 */
export function removeFootnoteMarker(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
  if (!(state.selection instanceof NodeSelection)) return false;
  if (state.selection.node.type.name !== "footnote_marker") return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  tr.deleteSelection();
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
