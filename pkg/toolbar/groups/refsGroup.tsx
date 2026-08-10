/**
 * `refs` group — reference marks + inline atom nodes (reference-marks.md §4).
 *
 * Six entries: four mark toggles (`xref`, `eref`, `concept`, `bcp14`) plus two
 * inline-atom node insertions (`footnote_marker`, `stem`). `xref` and `concept`
 * resolve their target via a doc-anchored picker popover (`XrefButton` /
 * `ConceptButton` in `TargetPicker.tsx`), bypassed when a host `onXrefPrompt` /
 * `onConceptPrompt` hook is supplied. `eref`, `bcp14`, and `stem` collect their
 * attribute via the built-in `<PromptPopover>` (or via host hooks when
 * supplied). The `footnote` button is a dedicated stateful component.
 */

import React, { useRef, useState } from "react";
import type { EditorState, Transaction } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

import {
  toggleEref,
  toggleBcp14,
  insertStem,
  insertBibitem,
} from "@metanorma/editor-commands";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import { collectBibliographyItems, citeas, label } from "@metanorma/relaton";
import type { BibliographicItem } from "@metanorma/relaton";

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
import { PromptPopover } from "../PromptPopover.js";

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
// Context builders (for host-hook paths)
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
// Shared capture type (stale-view guard)
// ---------------------------------------------------------------------------

/**
 * Captured editor references for the stale-view guard. When the PromptPopover
 * opens, `{ state, dispatch }` are captured synchronously at click time. The
 * submit handler dispatches against this captured state — not `view.state` at
 * submit time, which races against controlled-mode React state invalidation.
 */
interface Captured {
  readonly state: EditorState;
  readonly dispatch: (tr: Transaction) => void;
  readonly focus: () => void;
}

// ---------------------------------------------------------------------------
// ErefButton — mark toggle + bibliography picker (with free-text fallback)
// ---------------------------------------------------------------------------

function ErefButton({
  onErefPrompt,
}: {
  readonly onErefPrompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
}): React.JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const capturedRef = useRef<Captured | null>(null);

  const isActive = useEditorStateSelector((s) => refMarkActive(s, "eref"));
  const enabled = useEditorStateSelector(isInlineContext);
  // Collect known bib items on every render — the selector returns a count
  // (primitive) to stay referentially stable, but we need the actual items
  // when the popover opens. Read them at capture time instead.
  const bibItemCount = useEditorStateSelector((s) => collectBibliographyItems(s.doc).length);

  const toggleOff = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    toggleEref(view.state, view.dispatch, null);
    view.focus();
  });

  const viaHook = useEditorEventCallback(async (view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const ctx = buildRefContext(state, "eref");
    const cite = await onErefPrompt?.(ctx);
    if (cite === null || cite === undefined) {
      view.focus();
      return;
    }
    toggleEref(state, dispatch, cite);
    view.focus();
  });

  const captureAndOpen = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    capturedRef.current = { state: view.state, dispatch: view.dispatch, focus: () => view.focus() };
    setOpen(true);
  });

  const handleClick = (): void => {
    if (isActive) { void toggleOff(); return; }
    if (onErefPrompt !== undefined) { void viaHook(); return; }
    void captureAndOpen();
  };

  const handlePick = (cite: string): void => {
    setOpen(false);
    const c = capturedRef.current;
    if (c !== null && cite !== "") toggleEref(c.state, c.dispatch, cite);
    capturedRef.current = null;
    c?.focus();
  };

  const handleCancel = (): void => {
    setOpen(false);
    capturedRef.current = null;
  };

  return (
    <div className="mn-toolbar-eref">
      <button
        ref={triggerRef}
        type="button"
        className={isActive ? "mn-toolbar-btn mn-toolbar-btn--active" : "mn-toolbar-btn"}
        aria-pressed={isActive}
        disabled={!enabled}
        title="Insert bibliographic reference"
        onClick={handleClick}
      >
        Eref
      </button>
      {isOpen && capturedRef.current && (
        <ErefPicker
          items={collectBibliographyItems(capturedRef.current.state.doc)}
          onPick={handlePick}
          onCancel={handleCancel}
          anchorRef={triggerRef}
        />
      )}
      {/* Keep bibItemCount referenced so the selector re-evaluates */}
      <span hidden aria-hidden="true">{bibItemCount}</span>
    </div>
  );
}

/**
 * Eref picker popover — shows known bibliography items as a list, with a
 * free-text input for forward references (entries not yet entered).
 */
function ErefPicker({
  items,
  onPick,
  onCancel,
  anchorRef,
}: {
  readonly items: readonly BibliographicItem[];
  readonly onPick: (cite: string) => void;
  readonly onCancel: () => void;
  readonly anchorRef: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  const [manual, setManual] = useState("");
  const [style, setStyle] = useState<React.CSSProperties>({});
  const pickerRef = useRef<HTMLDivElement>(null);

  // Position below the trigger button.
  useState(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setStyle({ position: "fixed", left: rect.left, top: rect.bottom + 4, zIndex: 9999 });
    }
  });

  React.useEffect(() => {
    function onDown(e: MouseEvent): void {
      const target = e.target;
      if (
        pickerRef.current &&
        target instanceof Node &&
        !pickerRef.current.contains(target)
      ) {
        onCancel();
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  const dedupedItems = new Map<string, BibliographicItem>();
  for (const item of items) {
    const key = citeas(item);
    if (key !== null && !dedupedItems.has(key)) {
      dedupedItems.set(key, item);
    }
  }
  const knownItems = [...dedupedItems.values()];

  return (
    <div ref={pickerRef} className="mn-eref-picker" style={style}>
      <div className="mn-eref-picker__header">Select a reference</div>
      {knownItems.length > 0 ? (
        <ul className="mn-eref-picker__list">
          {knownItems.map((item) => {
            const key = citeas(item);
            if (key === null) return null;
            return (
              <li key={key}>
                <button
                  type="button"
                  className="mn-eref-picker__item"
                  onClick={() => onPick(key)}
                >
                  {label(item)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mn-eref-picker__empty">
          No bibliography entries yet. Enter a citation key manually below.
        </div>
      )}
      <div className="mn-eref-picker__manual">
        <input
          type="text"
          className="mn-eref-picker__input"
          placeholder="Citation key (e.g. ISO1234)"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && manual.trim() !== "") onPick(manual.trim());
          }}
          autoFocus
        />
        <button
          type="button"
          className="mn-eref-picker__btn"
          onClick={() => {
            if (manual.trim() !== "") onPick(manual.trim());
          }}
        >
          Insert
        </button>
      </div>
      <button type="button" className="mn-eref-picker__cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bcp14Button — mark toggle + empty-selection insert logic + PromptPopover
// ---------------------------------------------------------------------------

function Bcp14Button({
  onBcp14Prompt,
}: {
  readonly onBcp14Prompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
}): React.JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const capturedRef = useRef<Captured | null>(null);

  const isActive = useEditorStateSelector((s) => refMarkActive(s, "bcp14"));
  const enabled = useEditorStateSelector(isInlineContext);

  const toggleOff = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    toggleBcp14(view.state, view.dispatch, null);
    view.focus();
  });

  const viaHook = useEditorEventCallback(async (view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const ctx = buildRefContext(state, "bcp14");
    const type = await onBcp14Prompt?.(ctx);
    if (type === null || type === undefined) {
      view.focus();
      return;
    }
    dispatchBcp14Logic(state, dispatch, type);
    view.focus();
  });

  const captureAndOpen = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    capturedRef.current = { state: view.state, dispatch: view.dispatch, focus: () => view.focus() };
    setOpen(true);
  });

  const handleClick = (): void => {
    if (isActive) { void toggleOff(); return; }
    if (onBcp14Prompt !== undefined) { void viaHook(); return; }
    void captureAndOpen();
  };

  const handleSubmit = (type: string): void => {
    setOpen(false);
    const c = capturedRef.current;
    if (c !== null && type !== "") dispatchBcp14Logic(c.state, c.dispatch, type);
    capturedRef.current = null;
    c?.focus();
  };

  const handleCancel = (): void => {
    setOpen(false);
    capturedRef.current = null;
  };

  return (
    <div className="mn-toolbar-bcp14">
      <button
        ref={triggerRef}
        type="button"
        className={isActive ? "mn-toolbar-btn mn-toolbar-btn--active" : "mn-toolbar-btn"}
        aria-pressed={isActive}
        disabled={!enabled}
        title="Insert BCP14 keyword"
        onClick={handleClick}
      >
        Bcp14
      </button>
      <PromptPopover
        isOpen={isOpen}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        label="BCP14 keyword"
        placeholder="e.g. MUST, SHOULD, MAY"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bcp14 dispatch helper (shared by hook + popover paths)
// ---------------------------------------------------------------------------

/**
 * Dispatch the bcp14 keyword. When the selection is empty, insert the keyword
 * text and apply the mark to it (the keyword IS the displayed text), then
 * select the inserted text. When non-empty, wrap the selection.
 */
function dispatchBcp14Logic(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  type: string,
): void {
  if (state.selection.empty) {
    const { from } = state.selection;
    const tr = state.tr;
    tr.insertText(type, from);
    const bcp14Mark = state.schema.marks["bcp14"];
    if (bcp14Mark !== undefined) {
      tr.addMark(from, from + type.length, bcp14Mark.create({ type }));
    }
    tr.setSelection(TextSelection.create(tr.doc, from, from + type.length));
    dispatch(tr);
  } else {
    toggleBcp14(state, dispatch, type);
  }
}

// ---------------------------------------------------------------------------
// StemButton — inline-atom insertion + PromptPopover
// ---------------------------------------------------------------------------

function StemButton({
  onStemPrompt,
}: {
  readonly onStemPrompt?: ((context: StemPromptContext) => Promise<StemResult | null>) | undefined;
}): React.JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const capturedRef = useRef<Captured | null>(null);

  const enabled = useEditorStateSelector(isInlineContext);

  const viaHook = useEditorEventCallback(async (view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const ctx = buildStemContext(state);
    const result = await onStemPrompt?.(ctx);
    if (result === null || result === undefined) {
      view.focus();
      return;
    }
    insertStem(state, dispatch, result.type, result.source);
    view.focus();
  });

  const captureAndOpen = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    capturedRef.current = { state: view.state, dispatch: view.dispatch, focus: () => view.focus() };
    setOpen(true);
  });

  const handleClick = (): void => {
    if (onStemPrompt !== undefined) { void viaHook(); return; }
    void captureAndOpen();
  };

  const handleSubmit = (source: string): void => {
    setOpen(false);
    const c = capturedRef.current;
    if (c !== null && source !== "") insertStem(c.state, c.dispatch, "asciimath", source);
    capturedRef.current = null;
    c?.focus();
  };

  const handleCancel = (): void => {
    setOpen(false);
    capturedRef.current = null;
  };

  return (
    <div className="mn-toolbar-stem">
      <button
        ref={triggerRef}
        type="button"
        className="mn-toolbar-btn"
        disabled={!enabled}
        title="Insert inline formula"
        onClick={handleClick}
      >
        Formula
      </button>
      <PromptPopover
        isOpen={isOpen}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        label="Inline formula (AsciiMath)"
        placeholder="e.g. x^2 + y^2"
        submitLabel="Insert"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BibitemButton — insert a bibliography entry inside a references section
// ---------------------------------------------------------------------------

function BibitemButton(): React.JSX.Element {
  const insertAndFocus = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    insertBibitem(view.state, view.dispatch);
    view.focus();
  });

  const enabled = useEditorStateSelector((s) => {
    // Enabled only inside a references section.
    const $from = s.selection.$from;
    for (let d = $from.depth; d >= 0; d--) {
      if ($from.node(d).type.name === "references") return true;
    }
    return false;
  });

  return (
    <button
      type="button"
      className={enabled ? "mn-toolbar-btn" : "mn-toolbar-btn mn-toolbar-btn--disabled"}
      title="Add bibliography entry (inside References)"
      disabled={!enabled}
      onClick={() => void insertAndFocus()}
    >
      Bibitem
    </button>
  );
}

// ---------------------------------------------------------------------------
// Group factory
// ---------------------------------------------------------------------------

/**
 * Build the `refs` group, threading the prompt hooks.
 */
export function refsGroup(opts: AdvancedFeatureOptions): ToolbarGroupDef {
  return {
    id: "refs",
    label: "References",
    entries: [
      { kind: "control", render: () => <XrefButton onXrefPrompt={opts.onXrefPrompt} /> },
      { kind: "control", render: () => <ErefButton onErefPrompt={opts.onErefPrompt} /> },
      { kind: "control", render: () => <ConceptButton onConceptPrompt={opts.onConceptPrompt} /> },
      { kind: "control", render: () => <Bcp14Button onBcp14Prompt={opts.onBcp14Prompt} /> },
      { kind: "control", render: () => <FootnoteButton onFootnotePrompt={opts.onFootnotePrompt} /> },
      { kind: "control", render: () => <StemButton onStemPrompt={opts.onStemPrompt} /> },
      { kind: "control", render: () => <BibitemButton /> },
    ],
  };
}
