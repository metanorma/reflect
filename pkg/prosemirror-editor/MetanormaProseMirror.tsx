/**
 * `MetanormaProseMirror` — the main editor component (§5).
 *
 * Mounts a ProseMirror editor driven by `metanormaSchema`, rendered through
 * `@handlewithcare/react-prosemirror`. Supports both controlled
 * (`state` + `onStateChange`) and uncontrolled (`defaultState` / `defaultDoc`)
 * usage, bootstrapping from the default document (schema.spec.md §15) when no
 * initial state is supplied.
 */

import React, { useMemo } from "react";
import type { ReactNode } from "react";
import type { EditorState, Plugin } from "prosemirror-state";
import type { DirectEditorProps } from "prosemirror-view";
import type { ComponentType } from "react";
import type { HistoryOptions } from "@metanorma/editor-commands";
import {
  ProseMirror,
  ProseMirrorDoc,
} from "@handlewithcare/react-prosemirror";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

import { createInitialEditorState } from "./state.js";
import type { MetanormaDocument } from "./types.js";
import { nodeViewComponents as defaultNodeViewComponents } from "./nodeViews/index.js";
import "./style.css";

/** Props for the {@link MetanormaProseMirror} editor component (§5). */
export interface MetanormaProseMirrorProps {
  /** CONTROLLED mode: the authoritative EditorState. */
  readonly state?: EditorState;
  /** Called with the next EditorState after every dispatched transaction (controlled mode). */
  readonly onStateChange?: (state: EditorState) => void;

  /** UNCONTROLLED mode: the initial EditorState (component owns state thereafter). */
  readonly defaultState?: EditorState;
  /** UNCONTROLLED convenience: build the initial state from a MetanormaDocument (§6.1 shape). */
  readonly defaultDoc?: MetanormaDocument;

  /** Whether the document is editable. Defaults to `true`. Configures the EditorView `editable` prop. */
  readonly editable?: boolean;

  /** Extra ProseMirror plugins to merge into the initial state (in addition to `reactKeys`). */
  readonly plugins?: readonly Plugin[];
  /** Extra direct editor props forwarded to the underlying `ProseMirror` component. */
  readonly editorProps?: DirectEditorProps;

  /**
   * History configuration forwarded to `createInitialEditorState` (uncontrolled
   * mode only). `undefined` / `false` (default): history is NOT added.
   * A `HistoryOptions` value enables history with the supplied config.
   * In controlled mode this is ignored — the host controls the plugin list.
   */
  readonly history?: HistoryOptions | false;

  /** Per-node-name overrides/additions to the default node-view map (§7). */
  readonly nodeViewComponents?: Readonly<Record<string, ComponentType<NodeViewComponentProps>>>;

  /** Children rendered INSIDE the `ProseMirror` context, alongside `ProseMirrorDoc` (toolbars, widgets). */
  readonly children?: ReactNode;

  /** Class applied to the editor root wrapper. */
  readonly className?: string;
}

/**
 * A reusable React component that mounts a ProseMirror editor bound to the
 * Metanorma schema (`metanormaSchema`).
 *
 * Supports both controlled (`state` + `onStateChange`) and uncontrolled
 * (`defaultState` / `defaultDoc`) usage.
 */
export function MetanormaProseMirror({
  state,
  onStateChange,
  defaultState,
  defaultDoc,
  editable,
  plugins,
  editorProps,
  history,
  nodeViewComponents,
  children,
  className,
}: MetanormaProseMirrorProps): React.JSX.Element {
  if (state !== undefined && defaultState !== undefined) {
    throw new Error(
      "MetanormaProseMirror: providing both 'state' (controlled) and 'defaultState' (uncontrolled) is a programming error.",
    );
  }

  const controlled = state !== undefined;

  // ---- Uncontrolled mode: build the initial state once ----
  const initialUncontrolledState = useMemo<EditorState>(() => {
    if (defaultState !== undefined) {
      return defaultState;
    }
    const opts: { doc?: MetanormaDocument; plugins?: readonly Plugin[]; history?: HistoryOptions | false } = {};
    if (defaultDoc !== undefined) {
      opts.doc = defaultDoc;
    }
    if (plugins !== undefined) {
      opts.plugins = plugins;
    }
    if (history !== undefined) {
      opts.history = history; // exactOptionalPropertyTypes-safe
    }
    return createInitialEditorState(opts);
    // Intentionally exclude `editable` from deps — initial state build only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Merge consumer node-view overrides over the default map ----
  const mergedNodeViewComponents = useMemo(() => {
    if (nodeViewComponents === undefined) {
      return defaultNodeViewComponents;
    }
    return { ...defaultNodeViewComponents, ...nodeViewComponents };
  }, [nodeViewComponents]);

  const isEditable = editable ?? true;

  // ---- Common props forwarded to <ProseMirror> ----
  const sharedProps = {
    nodeViewComponents: mergedNodeViewComponents,
    editable: () => isEditable,
    ...(editorProps ?? {}),
  };

  if (controlled) {
    const stateValue = state as EditorState;
    return (
      <ProseMirror
        state={stateValue}
        dispatchTransaction={(tr) => {
          onStateChange?.(stateValue.apply(tr));
        }}
        {...sharedProps}
      >
        <div className={className ?? "mn-prosemirror"}>
          <ProseMirrorDoc />
          {children}
        </div>
      </ProseMirror>
    );
  }

  return (
    <ProseMirror
      defaultState={initialUncontrolledState}
      {...sharedProps}
    >
      <div className={className ?? "mn-prosemirror"}>
        <ProseMirrorDoc />
        {children}
      </div>
    </ProseMirror>
  );
}
