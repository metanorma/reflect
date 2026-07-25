/**
 * `images` group — image/figure insertion (images-figures.md §4).
 *
 * A single stateful control (`InsertImageButton`) rendered in place of a plain
 * button. It owns the dialog state, resolves the source asynchronously, and
 * calls the pure `insertImage` command.
 */

import React from "react";

import type { ToolbarGroupDef } from "../types.js";
import type { OnImageUpload } from "../AdvancedMetanormaToolbar.js";
import { InsertImageButton } from "../ImageInsertDialog.js";

/**
 * Build the `images` group, parameterised by the upload callback.
 */
export function imagesGroup(
  onImageUpload?: OnImageUpload,
): ToolbarGroupDef {
  return {
    id: "images",
    label: "Images",
    entries: [
      {
        kind: "control",
        render: () => <InsertImageButton onImageUpload={onImageUpload} />,
      },
    ],
  };
}
