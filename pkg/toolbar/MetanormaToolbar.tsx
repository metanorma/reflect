/**
 * `MetanormaToolbar` — thin assembler (§10.9).
 *
 * Schema-bound React toolbar rendered as a child of `MetanormaProseMirror`.
 * Reads editor state and dispatches transactions purely through the
 * `@handlewithcare/react-prosemirror` context — no state props.
 *
 * As of spec v2 this is a thin assembler over the shared `<Toolbar>` shell
 * (§10.4) and the `baseGroups` registry (§10.6). The mark/block/list/link
 * button definitions live in the group modules under `groups/`.
 *
 * See `docs/MetanormaToolbar.spec.md`.
 */

import React from "react";
import { useMemo } from "react";

import { Toolbar } from "./Toolbar.js";
import { baseGroups } from "./groups/index.js";
import type { BaseToolbarGroup } from "./types.js";

/** The four toolbar groups, rendered in declaration order (§4.2). */
export type ToolbarGroup = BaseToolbarGroup;

/** Props for {@link MetanormaToolbar} (§4.1). */
export interface MetanormaToolbarProps {
  /**
   * Optionally show/hide entire groups. When omitted, all groups are shown.
   * Keys not present in the object default to `true`.
   */
  readonly visibleGroups?: Readonly<Partial<Record<ToolbarGroup, boolean>>>;

  /** Class applied to the toolbar root `<div>`. Defaults to `"mn-toolbar"`. */
  readonly className?: string;

  /** Optional custom link-URL prompt. Default: built-in `<PromptPopover>`. */
  readonly onLinkPrompt?: () => Promise<string | null>;
}

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
  const groups = useMemo(
    () => baseGroups(onLinkPrompt),
    [onLinkPrompt],
  );

  return (
    <Toolbar
      groups={groups}
      visibleGroups={visibleGroups}
      className={className}
    />
  );
}
