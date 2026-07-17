/**
 * `MetanormaToolbar` — schema-bound React toolbar (§1, §3).
 *
 * Gives one-click access to the common document-manipulation operations
 * (toggling inline marks, wrapping blocks, inserting lists, creating links)
 * against the Metanorma ProseMirror schema. Designed to be rendered **inside**
 * `MetanormaProseMirror`, so it reads state and dispatches transactions purely
 * through the `@handlewithcare/react-prosemirror` context — no state props.
 *
 * See `docs/MetanormaToolbar.spec.md`.
 */

import React, { useRef, useState } from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import { toggleMark, wrapIn } from "prosemirror-commands";
import type { MarkType, NodeType } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { toggleList } from "./commands/toggleList.js";
import "./toolbar.css";

// ---------------------------------------------------------------------------
// Public types (§4.1, §4.2, §5)
// ---------------------------------------------------------------------------

/** The four toolbar groups, rendered in declaration order (§4.2). */
export type ToolbarGroup = "marks" | "blocks" | "lists" | "link";

/** Props for {@link MetanormaToolbar} (§4.1). */
export interface MetanormaToolbarProps {
  /**
   * Optionally show/hide entire groups. When omitted, all groups are shown.
   * Keys not present in the object default to `true`.
   */
  readonly visibleGroups?: Readonly<Partial<Record<ToolbarGroup, boolean>>>;

  /** Class applied to the toolbar root `<div>`. Defaults to `"mn-toolbar"`. */
  readonly className?: string;

  /** Optional custom link-URL prompt. Default: `window.prompt`. */
  readonly onLinkPrompt?: () => Promise<string | null>;
}

/**
 * Button descriptor (§5). `isActive` / `isEnabled` are pure functions of
 * {@link EditorState}; `run` dispatches against an {@link EditorView}.
 */
interface ToolbarButton {
  /** Unique key for React list rendering. */
  readonly key: string;
  /** Human-readable label shown as button text. */
  readonly label: string;
  /** ARIA title for the `<button>` element. */
  readonly title: string;
  /** Whether this button applies to the current selection. */
  readonly isActive: (state: EditorState) => boolean;
  /** Whether this button can execute against the current selection. */
  readonly isEnabled: (state: EditorState) => boolean;
  /** Dispatch the command via the `EditorView`. */
  readonly run: (view: EditorView) => void;
}

// ---------------------------------------------------------------------------
// Schema lookups (noUncheckedIndexedAccess → guard every index)
// ---------------------------------------------------------------------------

/** Resolve a mark type by name, throwing if absent (programmer error). */
function requireMark(name: string): MarkType {
  const mt = metanormaSchema.marks[name];
  if (mt === undefined) {
    throw new Error(`MetanormaToolbar: schema has no mark "${name}"`);
  }
  return mt;
}

/** Resolve a node type by name, throwing if absent (programmer error). */
function requireNode(name: string): NodeType {
  const nt = metanormaSchema.nodes[name];
  if (nt === undefined) {
    throw new Error(`MetanormaToolbar: schema has no node "${name}"`);
  }
  return nt;
}

// Group string — matches BLOCK_GROUP ("block") from the schema package,
// duplicated here so this module stays self-contained.
const BLOCK_GROUP = "block";

// ---------------------------------------------------------------------------
// Selection predicates
// ---------------------------------------------------------------------------

/**
 * Mark *types* active on the selection (§5.1 active rule): `storedMarks` for a
 * collapsed cursor, otherwise the marks at the end of the selection range.
 */
function activeMarkTypes(state: EditorState): readonly MarkType[] {
  const marks =
    state.selection.empty
      ? (state.storedMarks ?? state.selection.$from.marks())
      : state.selection.$to.marks();
  return marks.map((m) => m.type);
}

/**
 * Whether the selection sits in inline content (§5.1 enabled rule). Returns
 * `false` inside atom nodes (`formula`, `floating_title`, `image`) and the
 * code-only `sourcecode` node (`content: "text*"`, not rich text).
 */
function isInlineContext(state: EditorState): boolean {
  const parent = state.selection.$from.parent;
  // sourcecode is a text block but code-only: disable formatting there.
  if (parent.type === requireNode("sourcecode")) {
    return false;
  }
  // `inlineContent` is true when the node's content expression accepts inline
  // nodes (text). Atom/leaf nodes (formula, image, floating_title) and pure
  // block-content nodes have it false.
  return parent.type.inlineContent;
}

/**
 * Whether the selection's parent is a wrappable block (§5.2 / §5.3 enabled
 * rule): the parent belongs to the schema's `block` group, so `wrapIn` / list
 * wrapping can legally apply to it.
 */
function isBlockContext(state: EditorState): boolean {
  return state.selection.$from.parent.type.isInGroup(BLOCK_GROUP);
}

/** Whether `mark` is present at the current selection (§5.1). */
function isMarkActive(state: EditorState, mark: MarkType): boolean {
  return activeMarkTypes(state).includes(mark);
}

/** Whether the nearest list ancestor is `listType` (§5.3 active rule). */
function isListActive(state: EditorState, listType: NodeType): boolean {
  const depth = state.selection.$from.depth - 2;
  if (depth < 0) return false;
  return state.selection.$from.node(depth).type === listType;
}

/** Whether the immediate parent block is of `type` (§5.2 active rule). */
function isBlockWrapActive(state: EditorState, type: NodeType): boolean {
  return state.selection.$from.parent.type === type;
}

// ---------------------------------------------------------------------------
// Button construction (§5.1–5.4)
// ---------------------------------------------------------------------------

/**
 * Build the four groups of buttons once (§5). `getLinkPrompt` is read lazily by
 * the link button's `run`, so a ref can always supply the latest prompt without
 * rebuilding the descriptors.
 */
function buildButtons(
  getLinkPrompt: () => () => Promise<string | null>,
): Record<ToolbarGroup, readonly ToolbarButton[]> {
  // --- marks group (§5.1) — [markName, label, title, key] ---
  const markSpecs: ReadonlyArray<readonly [string, string, string, string]> = [
    ["strong", "B", "Bold", "strong"],
    ["emphasis", "I", "Italic", "emphasis"],
    ["underline", "U", "Underline", "underline"],
    ["strike", "S", "Strikethrough", "strike"],
    ["subscript", "x₂", "Subscript", "subscript"],
    ["superscript", "x²", "Superscript", "superscript"],
    ["code", "code", "Code", "code"],
    ["smallcap", "AA", "Small caps", "smallcap"],
  ];

  const marks: readonly ToolbarButton[] = markSpecs.map(
    ([markName, label, title, key]) => {
      const mark = requireMark(markName);
      return {
        key,
        label,
        title,
        isActive: (state) => isMarkActive(state, mark),
        isEnabled: isInlineContext,
        run: (view) => {
          toggleMark(mark)(view.state, view.dispatch);
        },
      };
    },
  );

  // --- blocks group (§5.2) — [nodeName, label, title, key] ---
  const blockSpecs: ReadonlyArray<readonly [string, string, string, string]> = [
    ["quote", "❝", "Quote", "quote"],
    ["note", "📝", "Note", "note"],
    ["example", "💡", "Example", "example"],
  ];

  // wrapIn lifts when the target already wraps the selection (§5.2 toggle).
  const blocks: readonly ToolbarButton[] = blockSpecs.map(
    ([nodeName, label, title, key]) => {
      const node = requireNode(nodeName);
      return {
        key,
        label,
        title,
        isActive: (state) => isBlockWrapActive(state, node),
        isEnabled: isBlockContext,
        run: (view) => {
          wrapIn(node)(view.state, view.dispatch);
        },
      };
    },
  );

  // --- lists group (§5.3) — [nodeName, label, title, key] ---
  const listSpecs: ReadonlyArray<readonly [string, string, string, string]> = [
    ["bullet_list", "•", "Bullet list", "bullet-list"],
    ["ordered_list", "1.", "Ordered list", "ordered-list"],
  ];

  const lists: readonly ToolbarButton[] = listSpecs.map(
    ([nodeName, label, title, key]) => {
      const node = requireNode(nodeName);
      return {
        key,
        label,
        title,
        isActive: (state) => isListActive(state, node),
        isEnabled: isBlockContext,
        run: (view) => {
          toggleList(view, node);
        },
      };
    },
  );

  // --- link group (§5.4) ---
  const linkMark = requireMark("link");
  const link: ToolbarButton = {
    key: "link",
    label: "🔗",
    title: "Link",
    isActive: (state) => isMarkActive(state, linkMark),
    isEnabled: (state) => {
      // Removal is always available when a link is active. Adding a link
      // requires a non-empty text selection in inline content (links attach to
      // text — §5.4 enabled rule).
      if (isMarkActive(state, linkMark)) return true;
      return isInlineContext(state) && !state.selection.empty;
    },
    run: (view) => {
      const { state } = view;
      // If a link is already present, remove it (toggleMark with no attrs).
      if (isMarkActive(state, linkMark)) {
        toggleMark(linkMark)(state, view.dispatch);
        return;
      }
      // Adding: prompt for a URL, then apply against the latest state.
      void getLinkPrompt()().then((href) => {
        if (href === null || href === "") return;
        // Dispatch against `view.state` — the selection may have changed
        // across the async prompt. toggleMark returns false if it no longer
        // applies.
        toggleMark(linkMark, { href })(view.state, view.dispatch);
      });
    },
  };

  return { marks, blocks, lists, link: [link] };
}

// ---------------------------------------------------------------------------
// Link prompt default (§6)
// ---------------------------------------------------------------------------

/** Default link-URL prompt: `window.prompt` (§6). */
function defaultLinkPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Link URL:")
      : null,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a single toolbar button. Subscribes to its own active/enabled slice of
 * editor state via `useEditorStateSelector`, so only buttons whose state
 * actually changed re-render (§7). Dispatches via `useEditorEventCallback`.
 */
function ToolbarButtonView({
  button,
}: {
  readonly button: ToolbarButton;
}): React.JSX.Element {
  const isActive = useEditorStateSelector(button.isActive);
  const isEnabled = useEditorStateSelector(button.isEnabled);
  const onClick = useEditorEventCallback((view: EditorView) => {
    button.run(view);
  });

  const classes = ["mn-toolbar-btn"];
  if (isActive) classes.push("mn-toolbar-btn--active");
  if (!isEnabled) classes.push("mn-toolbar-btn--disabled");

  return (
    <button
      type="button"
      className={classes.join(" ")}
      title={button.title}
      aria-pressed={isActive}
      disabled={!isEnabled}
      onClick={onClick}
    >
      {button.label}
    </button>
  );
}

const GROUP_ORDER: readonly ToolbarGroup[] = [
  "marks",
  "blocks",
  "lists",
  "link",
];

/**
 * Schema-bound React toolbar. Render as a child of `MetanormaProseMirror`:
 *
 * ```tsx
 * <MetanormaProseMirror state={st} onStateChange={setSt}>
 *   <MetanormaToolbar />
 * </MetanormaProseMirror>
 * ```
 */
export function MetanormaToolbar({
  visibleGroups,
  className,
  onLinkPrompt,
}: MetanormaToolbarProps): React.JSX.Element {
  // Keep the latest link prompt in a ref so button descriptors (built once)
  // always read the current value without being rebuilt.
  const linkPromptRef = useRef(onLinkPrompt ?? defaultLinkPrompt);
  linkPromptRef.current = onLinkPrompt ?? defaultLinkPrompt;

  // Build the button descriptors exactly once (lazy initialiser).
  const [buttons] = useState(() =>
    buildButtons(() => () => linkPromptRef.current()),
  );

  const visible = GROUP_ORDER.filter(
    (g) => visibleGroups === undefined || visibleGroups[g] !== false,
  );

  return (
    <div className={className ?? "mn-toolbar"} role="toolbar" aria-label="Formatting">
      {visible.map((group, i) => (
        <React.Fragment key={group}>
          {i > 0 ? (
            <span className="mn-toolbar-divider" aria-hidden="true" />
          ) : null}
          <div className="mn-toolbar-group">
            {buttons[group].map((button) => (
              <ToolbarButtonView key={button.key} button={button} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
