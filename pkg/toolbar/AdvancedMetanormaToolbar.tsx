/**
 * `AdvancedMetanormaToolbar` — thin assembler (AdvancedMetanormaToolbar §5.1).
 *
 * A superset of `MetanormaToolbar`: it renders every base group (marks, blocks,
 * lists, link) plus the six advanced groups (refs, sections, dl, tables,
 * images, history) through the shared `<Toolbar>` shell. It accepts everything
 * the base component does plus the feature-specific hooks called out across the
 * six feature docs.
 *
 * See [`docs/AdvancedMetanormaToolbar/README.md`](../../docs/AdvancedMetanormaToolbar/README.md).
 */

import React from "react";
import { useRef, useMemo } from "react";

import type { EditorState } from "prosemirror-state";
import type { HistoryOptions } from "@metanorma/editor-commands";

import { Toolbar } from "./Toolbar.js";
import { baseGroups, defaultLinkPrompt, buildAdvancedGroups } from "./groups/index.js";
import type { BaseToolbarGroup } from "./types.js";

// ---------------------------------------------------------------------------
// Group-id types (§5.3)
// ---------------------------------------------------------------------------

/** Base group ids (from MetanormaToolbar.spec.md §10.7). */
export type { BaseToolbarGroup };

/** Advanced group ids (one per document in this directory). */
export type AdvancedToolbarGroupId =
  | "outdent" | "tables" | "images" | "sections" | "refs" | "dl" | "history";

/** Union used by AdvancedMetanormaToolbarProps.visibleGroups. */
export type AdvancedToolbarGroup = BaseToolbarGroup | AdvancedToolbarGroupId;

// ---------------------------------------------------------------------------
// UI-only types (reference-marks.md §10) — attribute-resolution context
// ---------------------------------------------------------------------------

/** Context passed to the reference-mark prompt hooks (reference-marks.md §5.7). */
export interface RefPromptContext {
  /** Current EditorState (read-only; do not dispatch from a hook). */
  readonly state: EditorState;
  /** Current value of the mark's key attr at the selection, or null. */
  readonly currentValue: string | null;
  /** Selected text, if any, for wrapping/preview. */
  readonly selectedText: string | null;
}

/** Context passed to the stem prompt hook (reference-marks.md §5.6). */
export interface StemPromptContext extends RefPromptContext {
  readonly currentType: "asciimath" | "mathml" | null;
}

/** Result returned by the stem prompt hook. */
export interface StemResult {
  readonly type: "asciimath" | "mathml";
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Image upload / prompt types (images-figures.md §5)
// ---------------------------------------------------------------------------

/** Optional upload handler. Given a selected File, upload it and resolve to its URL. */
export type OnImageUpload = (file: File) => Promise<string>;

/** Optional custom image-source prompt. Replaces the built-in dialog. */
export type OnImagePrompt = () => Promise<
  { readonly src: string; readonly alt: string | null } | null
>;

// ---------------------------------------------------------------------------
// Feature options (threaded to buildAdvancedGroups)
// ---------------------------------------------------------------------------

/** Feature-specific options threaded to the advanced group factories. */
export interface AdvancedFeatureOptions {
  // — images group (images-figures.md) —
  readonly onImageUpload?: OnImageUpload | undefined;
  readonly onImagePrompt?: OnImagePrompt | undefined;
  // — refs group (reference-marks.md) —
  readonly onXrefPrompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
  readonly onErefPrompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
  readonly onConceptPrompt?: ((context: RefPromptContext) => Promise<{ ref: string; kind: "eref" | "xref" | "termref" } | null>) | undefined;
  readonly onBcp14Prompt?: ((context: RefPromptContext) => Promise<string | null>) | undefined;
  readonly onFootnotePrompt?: (() => Promise<string | null>) | undefined;
  readonly onStemPrompt?: ((context: StemPromptContext) => Promise<StemResult | null>) | undefined;
}

// ---------------------------------------------------------------------------
// Props (§5.2)
// ---------------------------------------------------------------------------

/** Props for {@link AdvancedMetanormaToolbar} (§5.2). */
export interface AdvancedMetanormaToolbarProps extends AdvancedFeatureOptions {
  /** Show/hide any group (base ids + advanced ids). Omitted ⇒ shown. */
  readonly visibleGroups?: Readonly<Partial<Record<AdvancedToolbarGroup, boolean>>> | undefined;
  readonly className?: string | undefined;

  // — link group (base), upgraded prompt hook (MetanormaToolbar.spec.md §6) —
  readonly onLinkPrompt?: () => Promise<string | null>;

  // — history group (undo-redo.md) —
  readonly history?: HistoryOptions | false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A superset of `MetanormaToolbar`. Render as a child of `MetanormaProseMirror`:
 *
 * ```tsx
 * <MetanormaProseMirror defaultDoc={doc} history={DEFAULT_HISTORY_OPTIONS}>
 *   <AdvancedMetanormaToolbar />
 * </MetanormaProseMirror>
 * ```
 */
export function AdvancedMetanormaToolbar({
  visibleGroups,
  className,
  onLinkPrompt,
  onImageUpload,
  onImagePrompt,
  onXrefPrompt,
  onErefPrompt,
  onConceptPrompt,
  onBcp14Prompt,
  onFootnotePrompt,
  onStemPrompt,
}: AdvancedMetanormaToolbarProps): React.JSX.Element {
  // Keep the latest link prompt in a ref so the base groups (built once) always
  // read the current value.
  const linkPromptRef = useRef(onLinkPrompt ?? defaultLinkPrompt);
  linkPromptRef.current = onLinkPrompt ?? defaultLinkPrompt;

  const base = useMemo(
    () => baseGroups(() => linkPromptRef.current()),
    [],
  );

  // Feature opts are stable per render; the group factory reads them eagerly.
  const advanced = useMemo(
    () =>
      buildAdvancedGroups({
        onImageUpload,
        onImagePrompt,
        onXrefPrompt,
        onErefPrompt,
        onConceptPrompt,
        onBcp14Prompt,
        onFootnotePrompt,
        onStemPrompt,
      }),
    [
      onImageUpload,
      onImagePrompt,
      onXrefPrompt,
      onErefPrompt,
      onConceptPrompt,
      onBcp14Prompt,
      onFootnotePrompt,
      onStemPrompt,
    ],
  );

  const groups = useMemo(() => [...base, ...advanced], [base, advanced]);

  return (
    <Toolbar
      groups={groups}
      visibleGroups={visibleGroups}
      className={className ?? "mn-toolbar mn-toolbar--advanced"}
    />
  );
}
