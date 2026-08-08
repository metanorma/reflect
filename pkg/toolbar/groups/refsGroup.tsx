/**
 * `refs` group — reference marks + inline atom nodes (reference-marks.md §4).
 *
 * Six buttons: four mark toggles (`xref`, `eref`, `concept`, `bcp14`) plus two
 * inline-atom node insertions (`footnote_marker`, `stem`). `xref` and `concept`
 * resolve their target via a doc-anchored picker popover (`XrefButton` /
 * `ConceptButton` in `TargetPicker.tsx`), bypassed when a host `onXrefPrompt` /
 * `onConceptPrompt` hook is supplied. `eref` and `bcp14` collect their attribute
 * via an async prompt hook before calling the pure command. The node buttons
 * resolve their attrs via `onFootnotePrompt` / `onStemPrompt` (or defaults).
 */

import React from "react";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

import {
  toggleEref,
  toggleBcp14,
  insertStem,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import type {
  AdvancedFeatureOptions,
  RefPromptContext,
  StemPromptContext,
  StemResult,
} from "../AdvancedMetanormaToolbar.js";
import { isInlineContext } from "../predicates.js";
import { FootnoteButton } from "../FootnotePicker.js";
import { XrefButton, ConceptButton } from "../TargetPicker.js";

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

function defaultErefPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Citation key:")
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
  const getErefPrompt = opts.onErefPrompt ?? defaultErefPrompt;
  const getBcp14Prompt = opts.onBcp14Prompt ?? defaultBcp14Prompt;
  const getFootnotePrompt = opts.onFootnotePrompt;
  const getStemPrompt = opts.onStemPrompt ?? defaultStemPrompt;

  return {
    id: "refs",
    label: "References",
    entries: [
        // ── xref ──
        // Doc-anchored target picker (reference-marks.md §5.1). The dedicated
        // component owns the picker popover and toggle-off; onXrefPrompt, when
        // supplied, bypasses the picker for a host-provided picker.
        {
          kind: "control",
          render: () => <XrefButton onXrefPrompt={opts.onXrefPrompt} />,
        },
      // ── eref ──
      {
        kind: "button",
        descriptor: {
          key: "refs-eref",
          label: "Eref",
          title: "Insert bibliographic reference",
          isActive: (state) => refMarkActive(state, "eref"),
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            const { state, dispatch } = view;
            if (refMarkActive(state, "eref")) {
              toggleEref(state, dispatch, null);
              view.focus();
              return;
            }
            const ctx = buildRefContext(state, "eref");
            void getErefPrompt(ctx).then((cite) => {
              if (cite === null) return;
              toggleEref(state, dispatch, cite);
              view.focus();
            });
          },
        },
      },
        // ── concept ──
        // Doc-anchored target picker (reference-marks.md §5.3). The picker
        // path uses kind "xref" (document-internal); onConceptPrompt bypasses
        // the picker for a host-provided one returning { ref, kind }.
        {
          kind: "control",
          render: () => <ConceptButton onConceptPrompt={opts.onConceptPrompt} />,
        },
      // ── bcp14 ──
      {
        kind: "button",
        descriptor: {
          key: "refs-bcp14",
          label: "Bcp14",
          title: "Insert BCP14 keyword",
          isActive: (state) => refMarkActive(state, "bcp14"),
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            const { state, dispatch } = view;
            if (refMarkActive(state, "bcp14")) {
              toggleBcp14(state, dispatch, null);
              view.focus();
              return;
            }
            const ctx = buildRefContext(state, "bcp14");
            void getBcp14Prompt(ctx).then((type) => {
              if (type === null) return;
              if (state.selection.empty) {
                // Unlike xref/eref/concept (whose prompt value is metadata —
                // a reference target), bcp14's keyword IS the displayed text.
                // With an empty selection, applying the mark as a stored mark
                // is invisible (docChanged:false). Insert the keyword text and
                // apply the mark to it in one transaction, then select it so
                // the user can immediately retype or extend it (§5.4, §6.1).
                const { from } = state.selection;
                const tr = state.tr;
                tr.insertText(type, from);
                tr.addMark(from, from + type.length, state.schema.marks["bcp14"]!.create({ type }));
                tr.setSelection(TextSelection.create(tr.doc, from, from + type.length));
                dispatch(tr);
              } else {
                toggleBcp14(state, dispatch, type);
              }
              view.focus();
            });
          },
        },
      },
      // ── footnote ──
      // Stateful control: detects NodeSelection on a marker (toggle-off →
      // removeFootnoteMarker), creates new immediately when no entries exist,
      // or opens a picker dialog for reuse (reference-marks.md §5.5, §7).
      {
        kind: "control",
        render: () => <FootnoteButton onFootnotePrompt={getFootnotePrompt} />,
      },
      // ── stem ──
      {
        kind: "button",
        descriptor: {
          key: "refs-stem",
          label: "Formula",
          title: "Insert inline formula",
          isActive: (_state) => false,
          isEnabled: isInlineContext,
          run: (view: EditorView) => {
            const { state, dispatch } = view;
            const ctx = buildStemContext(state);
            void getStemPrompt(ctx).then((result) => {
              if (result === null) return;
              insertStem(state, dispatch, result.type, result.source);
              view.focus();
            });
          },
        },
      },
    ],
  };
}
