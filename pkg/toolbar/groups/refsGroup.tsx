/**
 * `refs` group — reference marks + inline atom nodes (reference-marks.md §4).
 *
 * Six buttons: four mark toggles (`xref`, `eref`, `concept`, `bcp14`) plus two
 * inline-atom node insertions (`footnote_marker`, `stem`). The mark buttons
 * collect their attribute via an async prompt hook (`onXrefPrompt`, etc.) before
 * calling the pure command. The node buttons resolve their attrs via
 * `onFootnotePrompt` / `onStemPrompt` (or defaults).
 */

import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import {
  toggleXref,
  toggleEref,
  toggleConcept,
  toggleBcp14,
  insertFootnoteMarker,
  insertStem,
  generateId,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import type {
  AdvancedFeatureOptions,
  RefPromptContext,
  StemPromptContext,
  StemResult,
} from "../AdvancedMetanormaToolbar.js";
import { isInlineContext } from "../predicates.js";

import "../reference-marks.css"; // re-uses the popover styles for the stem menu

// ---------------------------------------------------------------------------
// Active / enabled detection
// ---------------------------------------------------------------------------

/** Whether a named mark is active at the current selection. */
function refMarkActive(state: EditorState, name: string): boolean {
  const mark = state.schema.marks[name];
  if (mark === undefined) return false;
  const marks = state.selection.empty
    ? (state.storedMarks ?? state.selection.$from.marks())
    : state.selection.$to.marks();
  return mark.isInSet(marks) !== undefined;
}

// ---------------------------------------------------------------------------
// Default prompt implementations (reference-marks.md §5)
// ---------------------------------------------------------------------------

function defaultXrefPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Cross-reference target id:")
      : null,
  );
}

function defaultErefPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Citation key:")
      : null,
  );
}

function defaultConceptPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Concept id:")
      : null,
  );
}

function defaultBcp14Prompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("BCP14 keyword:")
      : null,
  );
}

/** Default stem prompt: minimal window.prompt for AsciiMath source. */
function defaultStemPrompt(): Promise<StemResult | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? (() => {
          const source = window.prompt("Inline formula (AsciiMath):");
          if (source === null) return null;
          return { type: "asciimath" as const, source };
        })()
      : null,
  );
}

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

function buildRefContext(state: EditorState, name: string): RefPromptContext {
  const mark = state.schema.marks[name];
  let currentValue: string | null = null;
  if (mark !== undefined) {
    const marks = state.selection.empty
      ? (state.storedMarks ?? state.selection.$from.marks())
      : state.selection.$to.marks();
    const active = mark.isInSet(marks);
    if (active !== undefined) {
      const v = active.attrs["target"] ?? active.attrs["cite"] ?? active.attrs["ref"] ?? active.attrs["type"];
      currentValue = typeof v === "string" ? v : null;
    }
  }
  const selectedText =
    !state.selection.empty
      ? state.doc.textBetween(state.selection.from, state.selection.to, " ")
      : null;
  return { state, currentValue, selectedText };
}

function buildStemContext(state: EditorState): StemPromptContext {
  const base = buildRefContext(state, "stem");
  return { ...base, currentType: null };
}

// ---------------------------------------------------------------------------
// Group factory
// ---------------------------------------------------------------------------

/**
 * Build the `refs` group, threading the prompt hooks.
 */
export function refsGroup(opts: AdvancedFeatureOptions): ToolbarGroupDef {
  const getXrefPrompt = opts.onXrefPrompt ?? defaultXrefPrompt;
  const getErefPrompt = opts.onErefPrompt ?? defaultErefPrompt;
  const getConceptPrompt = opts.onConceptPrompt ?? defaultConceptPrompt;
  const getBcp14Prompt = opts.onBcp14Prompt ?? defaultBcp14Prompt;
  const getFootnotePrompt = opts.onFootnotePrompt;
  const getStemPrompt = opts.onStemPrompt ?? defaultStemPrompt;

  return {
    id: "refs",
    label: "References",
    entries: [
      // ── xref ──
      {
        kind: "button",
        descriptor: {
          key: "refs-xref",
          label: "↗",
          title: "Insert cross-reference",
          isActive: (state) => refMarkActive(state, "xref"),
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            if (refMarkActive(view.state, "xref")) {
              toggleXref(view.state, view.dispatch, null);
              view.focus();
              return;
            }
            const ctx = buildRefContext(view.state, "xref");
            void getXrefPrompt(ctx).then((target) => {
              if (target === null) return;
              toggleXref(view.state, view.dispatch, target);
              view.focus();
            });
          },
        },
      },
      // ── eref ──
      {
        kind: "button",
        descriptor: {
          key: "refs-eref",
          label: "📕",
          title: "Insert bibliographic reference",
          isActive: (state) => refMarkActive(state, "eref"),
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            if (refMarkActive(view.state, "eref")) {
              toggleEref(view.state, view.dispatch, null);
              view.focus();
              return;
            }
            const ctx = buildRefContext(view.state, "eref");
            void getErefPrompt(ctx).then((cite) => {
              if (cite === null) return;
              toggleEref(view.state, view.dispatch, cite);
              view.focus();
            });
          },
        },
      },
      // ── concept ──
      {
        kind: "button",
        descriptor: {
          key: "refs-concept",
          label: "💡",
          title: "Insert concept reference",
          isActive: (state) => refMarkActive(state, "concept"),
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            if (refMarkActive(view.state, "concept")) {
              toggleConcept(view.state, view.dispatch, null);
              view.focus();
              return;
            }
            const ctx = buildRefContext(view.state, "concept");
            void getConceptPrompt(ctx).then((ref) => {
              if (ref === null) return;
              toggleConcept(view.state, view.dispatch, ref);
              view.focus();
            });
          },
        },
      },
      // ── bcp14 ──
      {
        kind: "button",
        descriptor: {
          key: "refs-bcp14",
          label: "MUST",
          title: "Insert BCP14 keyword",
          isActive: (state) => refMarkActive(state, "bcp14"),
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            if (refMarkActive(view.state, "bcp14")) {
              toggleBcp14(view.state, view.dispatch, null);
              view.focus();
              return;
            }
            const ctx = buildRefContext(view.state, "bcp14");
            void getBcp14Prompt(ctx).then((type) => {
              if (type === null) return;
              toggleBcp14(view.state, view.dispatch, type);
              view.focus();
            });
          },
        },
      },
      // ── footnote ──
      {
        kind: "button",
        descriptor: {
          key: "refs-footnote",
          label: "⁺",
          title: "Insert footnote",
          isActive: (_state) => false,
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            // Default: generate a fresh id for a new footnote entry.
            const target = generateId();
            if (getFootnotePrompt !== undefined) {
              void getFootnotePrompt().then((id) => {
                if (id === null) return;
                insertFootnoteMarker(view.state, view.dispatch, id);
                view.focus();
              });
            } else {
              insertFootnoteMarker(view.state, view.dispatch, target);
              view.focus();
            }
          },
        },
      },
      // ── stem ──
      {
        kind: "button",
        descriptor: {
          key: "refs-stem",
          label: "∑",
          title: "Insert inline formula",
          isActive: (_state) => false,
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            const ctx = buildStemContext(view.state);
            void getStemPrompt(ctx).then((result) => {
              if (result === null) return;
              insertStem(view.state, view.dispatch, result.type, result.source);
              view.focus();
            });
          },
        },
      },
    ],
  };
}
