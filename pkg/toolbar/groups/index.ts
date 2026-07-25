/**
 * Base + advanced group registry (§10.6, AdvancedMetanormaToolbar §5.1.2).
 *
 * The four base groups are produced by a factory (`baseGroups`) rather than a
 * bare constant so the latest `onLinkPrompt` can be threaded into the link
 * group. The advanced component's `buildAdvancedGroups` factory produces the
 * six advanced groups, threading feature-specific props.
 */

import type { ToolbarGroupDef } from "../types.js";

import { marksGroup } from "./marksGroup.js";
import { blocksGroup } from "./blocksGroup.js";
import { listsGroup } from "./listsGroup.js";
import { makeLinkGroup, defaultLinkPrompt } from "./linkGroup.js";
import { refsGroup } from "./refsGroup.js";
import { sectionsGroup } from "./sectionsGroup.js";
import { definitionListGroup } from "./definitionListGroup.js";
import { tablesGroup } from "./tablesGroup.js";
import { imagesGroup } from "./imagesGroup.js";
import { historyGroup } from "./historyGroup.js";
import type { AdvancedFeatureOptions } from "../AdvancedMetanormaToolbar.js";

export { defaultLinkPrompt } from "./linkGroup.js";
export { makeLinkGroup } from "./linkGroup.js";

/**
 * Build the four base groups, threading the link prompt (§10.6).
 *
 * @param onLinkPrompt — the link-URL prompt callback (defaults to
 *   `defaultLinkPrompt` / `window.prompt`).
 */
export function baseGroups(
  onLinkPrompt: () => Promise<string | null> = defaultLinkPrompt,
): readonly ToolbarGroupDef[] {
  // Wrap the prompt in the lazy-getter shape that `makeLinkGroup` expects.
  const linkGroup = makeLinkGroup(() => onLinkPrompt);
  return [marksGroup, blocksGroup, listsGroup, linkGroup];
}

/**
 * Build the six advanced groups, threading feature-specific props
 * (AdvancedMetanormaToolbar §5.1.2).
 *
 * Render order: refs → sections → dl → tables → images → history.
 */
export function buildAdvancedGroups(
  opts: AdvancedFeatureOptions,
): readonly ToolbarGroupDef[] {
  return [
    refsGroup(opts),
    sectionsGroup(),
    definitionListGroup,
    tablesGroup,
    imagesGroup(opts.onImageUpload),
    historyGroup,
  ];
}
