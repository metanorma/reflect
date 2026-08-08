/**
 * `PromptPopover` — a reusable single-input dialog built from
 * `react-aria-components` (RAC).
 *
 * Replaces every `window.prompt` call in the toolbar with an accessible DOM
 * dialog: a RAC `<Popover>` anchored to the trigger button, containing a
 * `<Dialog>` with a `<Form>`, `<TextField>`, `<Label>`, and OK/Cancel
 * `<Button>`s. RAC handles auto-focus, Escape-to-close, Enter-to-submit,
 * screen-reader labelling, and top-layer overlay rendering (via React portal).
 *
 * Used by the Link, Eref, Bcp14, Stem, and Clause buttons.
 */

import React, { useState, useEffect } from "react";
import {
  Popover,
  Dialog,
  Form,
  TextField,
  Input,
  Label,
  Button,
} from "react-aria-components";
import type { RefObject } from "react";

import "./prompt-popover.css";

/** Props for {@link PromptPopover}. */
export interface PromptPopoverProps {
  /** Whether the popover is open (controlled). */
  readonly isOpen: boolean;
  /** Called when the popover should close (Escape, click-outside, Cancel). */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Ref of the trigger button — RAC positions the popover relative to it. */
  readonly triggerRef: RefObject<Element | null>;
  /** Dialog heading + field label (e.g. "Link URL", "Clause heading"). */
  readonly label: string;
  /** Placeholder for the text input. */
  readonly placeholder?: string | undefined;
  /** Initial value populated when the popover opens. */
  readonly initialValue?: string | undefined;
  /** Label for the submit button. Defaults to "OK". */
  readonly submitLabel?: string | undefined;
  /** Called with the submitted value when the user clicks OK or presses Enter. */
  readonly onSubmit: (value: string) => void;
  /** Called when the user cancels (Escape or Cancel button). */
  readonly onCancel: () => void;
}

/**
 * A single-input dialog popover.
 *
 * RAC's `<Popover isOpen={isOpen} onOpenChange={...} triggerRef={...}>`
 * renders in a portal at `<body>`, so it escapes any ancestor overflow /
 * stacking-context clipping — the same top-layer guarantee the HTML Popover API
 * migration achieved for the other pickers. `<TextField>` auto-focuses on open
 * (RAC handles this). Enter submits the form; Escape closes (RAC handles both).
 */
export function PromptPopover({
  isOpen,
  onOpenChange,
  triggerRef,
  label,
  placeholder,
  initialValue,
  submitLabel = "OK",
  onSubmit,
  onCancel,
}: PromptPopoverProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue ?? "");

  // Reset the field to the initial value each time the popover opens.
  useEffect(() => {
    if (isOpen) setValue(initialValue ?? "");
  }, [isOpen, initialValue]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    onSubmit(value);
  };

  const handleCancel = (): void => {
    onCancel();
  };

  // RAC's onOpenChange fires `false` on Escape / click-outside. Treat that as
  // cancel (matching window.prompt's dismiss behaviour).
  const handleOpenChange = (open: boolean): void => {
    if (!open) handleCancel();
    onOpenChange(open);
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      triggerRef={triggerRef}
      offset={4}
      className="mn-prompt-popover"
    >
      <Dialog aria-label={label}>
        <Form onSubmit={handleSubmit}>
          <TextField
            value={value}
            onChange={setValue}
            autoFocus
            className="mn-prompt-popover__field"
          >
            <Label className="mn-prompt-popover__label">{label}</Label>
            <Input
              type="text"
              placeholder={placeholder ?? ""}
              className="mn-prompt-popover__input"
            />
          </TextField>
          <div className="mn-prompt-popover__actions">
            <Button
              type="button"
              onPress={handleCancel}
              className="mn-prompt-popover__btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="mn-prompt-popover__btn mn-prompt-popover__btn--primary"
            >
              {submitLabel}
            </Button>
          </div>
        </Form>
      </Dialog>
    </Popover>
  );
}
