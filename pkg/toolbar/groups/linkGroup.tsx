/**
 * `link` group — hyperlink (§5.4, §6).
 *
 * Extracted from the former `buildButtons()` monolith. The `link` mark carries
 * an `href` attribute (default `null`), so a simple `toggleMark` is
 * insufficient — the user must supply a URL. The group is parameterised by a
 * prompt callback: `makeLinkGroup(onLinkPrompt)` produces a `ToolbarGroupDef`
 * that reads the latest prompt lazily.
 */

import { toggleMark } from "prosemirror-commands";

import type { ToolbarGroupDef } from "../types.js";
import { isInlineContext, isMarkActive, requireMark } from "../predicates.js";

/** Default link-URL prompt: `window.prompt` (§6). */
export function defaultLinkPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Link URL:")
      : null,
  );
}

/**
 * Build the `link` group, parameterised by the URL-prompt callback (§5.4, §6).
 *
 * The prompt is read lazily by the button's `run`, so a ref can always supply
 * the latest value without rebuilding the descriptor.
 */
export function makeLinkGroup(
  getLinkPrompt: () => () => Promise<string | null>,
): ToolbarGroupDef {
  const linkMark = requireMark("link");
  return {
    id: "link",
    label: "Hyperlink",
    entries: [
      {
        kind: "button",
        descriptor: {
          key: "link",
          label: "🔗",
          title: "Link",
          isActive: (state) => isMarkActive(state, linkMark),
          isEnabled: (state) => {
            // Removal is always available when a link is active. Adding a link
            // requires a non-empty text selection in inline content (links
            // attach to text — §5.4 enabled rule).
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
              // across the async prompt. toggleMark returns false if it no
              // longer applies.
              toggleMark(linkMark, { href })(view.state, view.dispatch);
            });
          },
        },
      },
    ],
  };
}
