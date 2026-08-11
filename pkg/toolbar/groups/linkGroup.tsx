/**
 * `link` group — hyperlink (§5.4, §6).
 *
 * The `link` mark carries an `href` attribute (default `null`), so a simple
 * `toggleMark` is insufficient — the user must supply a URL. The Link button is
 * a `kind: "control"` entry rendering `<LinkButton>`, which opens a
 * `<PromptPopover>` to collect the URL. When a host supplies `onLinkPrompt`,
 * the popover is bypassed and the hook resolves the URL instead.
 */

import React, { useRef, useState } from "react";
import { toggleMark } from "prosemirror-commands";
import type { EditorState, Transaction } from "prosemirror-state";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import type { ToolbarGroupDef } from "../types.js";
import { isInlineContext, isMarkActive, requireMark } from "../predicates.js";
import { PromptPopover } from "../PromptPopover.js";

// ---------------------------------------------------------------------------
// LinkButton — stateful control component
// ---------------------------------------------------------------------------

/** Props for {@link LinkButton}. */
interface LinkButtonProps {
  /** Optional host hook. When provided, bypasses the built-in popover. */
  readonly onLinkPrompt?: (() => Promise<string | null>) | undefined;
}

/**
 * The "Link" trigger button + `PromptPopover`.
 *
 * - **Active (link mark present)**: click toggles the mark off.
 * - **`onLinkPrompt` hook provided**: delegates to the async hook.
 * - **Otherwise**: opens the `PromptPopover` to collect a URL.
 *
 * When opening the popover, `{ state, dispatch }` are captured synchronously
 * at click time (stale-view guard). The submit handler dispatches against the
 * captured state — same pattern as `TargetButton` and `SectionPopover`.
 */
function LinkButton({ onLinkPrompt }: LinkButtonProps): React.JSX.Element {
  const linkMark = requireMark("link");
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Capture state/dispatch at click time so the submit handler dispatches
  // against the state that was current when the user opened the popover.
  // Reading `view.state` at submit time races against controlled-mode React
  // state invalidation (project memory: stale-view guard).
  const capturedRef = useRef<{
    readonly state: EditorState;
    readonly dispatch: (tr: Transaction) => void;
    readonly focus: () => void;
  } | null>(null);

  const isActive = useEditorStateSelector((s) => isMarkActive(s, linkMark));
  const isEnabled = useEditorStateSelector((s) => {
    if (isMarkActive(s, linkMark)) return true;
    return isInlineContext(s) && !s.selection.empty;
  });

  const toggleOff = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    toggleMark(linkMark)(view.state, view.dispatch);
    view.focus();
  });

  const viaHook = useEditorEventCallback(async (view: EditorView | null) => {
    if (view === null) return;
    const { state, dispatch } = view;
    const href = await onLinkPrompt?.();
    if (href === null || href === undefined || href === "") {
      view.focus();
      return;
    }
    toggleMark(linkMark, { href })(state, dispatch);
    view.focus();
  });

  // Capture the live view at click time (before the popover opens and focus
  // potentially moves to the popover's text field).
  const captureAndOpen = useEditorEventCallback((view: EditorView | null) => {
    if (view === null) return;
    capturedRef.current = {
      state: view.state,
      dispatch: view.dispatch,
      focus: () => view.focus(),
    };
    setOpen(true);
  });

  const handleClick = (): void => {
    if (isActive) {
      void toggleOff();
      return;
    }
    if (onLinkPrompt !== undefined) {
      void viaHook();
      return;
    }
    void captureAndOpen();
  };

  const handleSubmit = (href: string): void => {
    setOpen(false);
    const captured = capturedRef.current;
    if (captured !== null && href !== "") {
      toggleMark(linkMark, { href })(captured.state, captured.dispatch);
      captured.focus();
    }
    capturedRef.current = null;
  };

  const handleCancel = (): void => {
    setOpen(false);
    capturedRef.current = null;
  };

  return (
    <div className="mn-toolbar-link">
      <button
        ref={triggerRef}
        type="button"
        className={
          isActive
            ? "mn-toolbar-btn mn-toolbar-btn--active"
            : "mn-toolbar-btn"
        }
        aria-pressed={isActive}
        disabled={!isEnabled}
        title="Link"
        onClick={handleClick}
      >
        Link
      </button>
      <PromptPopover
        isOpen={isOpen}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        label="Link URL"
        placeholder="https://"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group factory
// ---------------------------------------------------------------------------

/**
 * Build the `link` group, parameterised by the URL-prompt hook.
 *
 * When `onLinkPrompt` is undefined, the built-in `<PromptPopover>` is used.
 */
export function makeLinkGroup(
  onLinkPrompt?: (() => Promise<string | null>) | undefined,
): ToolbarGroupDef {
  return {
    id: "link",
    label: "Hyperlink",
    entries: [
      {
        kind: "control",
        render: () => <LinkButton onLinkPrompt={onLinkPrompt} />,
      },
    ],
  };
}
