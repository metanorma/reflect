/**
 * `images` group — figure/image insertion (images-figures.md §4).
 *
 * Two entries with split responsibilities (the schema makes `image` reachable
 * only inside `figure`, so figure creation and image filling are separate
 * user actions):
 *
 * - a plain **Figure** button (`insertFigure`) — creates
 *   `figure > [figure_name]`, cursor in the caption;
 * - the stateful **Image** dialog control (`InsertImageButton`) — single
 *   mode: adds the `image` atom to the figure the caret is in (enabled =
 *   `canInsertImageIntoFigure`).
 */

import React from "react";

import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { insertFigure } from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import type { OnImageUpload } from "../AdvancedMetanormaToolbar.js";
import { InsertImageButton } from "../ImageInsertDialog.js";

/** The Figure button descriptor (images-figures.md §4.1). */
const figureButton = {
  key: "figure",
  label: "Figure",
  title: "Insert figure (caption + empty body)",
  isActive: (_state: EditorState) => false,
  isEnabled: (state: EditorState) => insertFigure(state) === true,
  run: (view: EditorView) => {
    insertFigure(view.state, view.dispatch);
    view.focus();
  },
};

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
        kind: "button",
        descriptor: figureButton,
      },
      {
        kind: "control",
        render: () => <InsertImageButton onImageUpload={onImageUpload} />,
      },
    ],
  };
}
