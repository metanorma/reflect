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

/**
 * Compose the `.mn-toolbar-btn` class list for a trigger button (base spec
 * §8/§9): the base class always, the `--active` modifier when the command
 * applies, and — required by the spec but easy to forget in hand-rolled
 * stateful triggers — the `--disabled` modifier when it does not. The native
 * `disabled` attribute must ALSO be set (a11y); the modifier carries the
 * visual contract (`opacity`, `cursor`) that the attribute alone does not.
 */
export function toolbarButtonClass(
  isActive?: boolean,
  isEnabled?: boolean,
): string {
  const classes = ["mn-toolbar-btn"];
  if (isActive === true) classes.push("mn-toolbar-btn--active");
  if (isEnabled === false) classes.push("mn-toolbar-btn--disabled");
  return classes.join(" ");
}

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

  return (
    <button
      type="button"
      className={toolbarButtonClass(isActive, isEnabled)}
      title={button.title}
      aria-pressed={isActive}
      disabled={!isEnabled}
      onClick={onClick}
    >
      {button.label}
    </button>
  );
}
