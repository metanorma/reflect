/**
 * `<ToolbarButtonView>` — renders a single {@link ToolbarButton} descriptor
 * (§10.5).
 *
 * Subscribes to its own active/enabled slice of editor state via
 * `useEditorStateSelector`, so only buttons whose state actually changed
 * re-render (§7). Dispatches via `useEditorEventCallback`.
 */

import React from "react";

import {
  useEditorStateSelector,
  useEditorEventCallback,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import type { ToolbarButton } from "./types.js";

export function ToolbarButtonView({
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
