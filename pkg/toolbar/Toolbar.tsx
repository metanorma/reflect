/**
 * `<Toolbar>` — the shared shell component (§10.4).
 *
 * Iterates `groups`, skips any whose `visibleGroups[id] === false`, and
 * inserts a `.mn-toolbar-divider` between visible groups. For each entry it
 * renders `<ToolbarButtonView>` (for `kind: "button"`) or the control's node
 * (for `kind: "control"`). Reuses the `mn-toolbar*` CSS classes from §8.
 */

import React from "react";

import type { ToolbarProps, ToolbarButtonEntry, ToolbarControlEntry } from "./types.js";
import { ToolbarButtonView } from "./ToolbarButtonView.js";

import "./toolbar.css";

/** Render a single `ToolbarButtonEntry`. */
function ButtonEntry({ entry }: { readonly entry: ToolbarButtonEntry }): React.JSX.Element {
  return <ToolbarButtonView button={entry.descriptor} />;
}

/** Render a single `ToolbarControlEntry`. */
function ControlEntry({ entry }: { readonly entry: ToolbarControlEntry }): React.JSX.Element {
  return <>{entry.render()}</>;
}

export function Toolbar({
  groups,
  visibleGroups,
  className,
}: ToolbarProps): React.JSX.Element {
  // Skip any group explicitly hidden via visibleGroups[id] === false.
  const visible = groups.filter(
    (g) => visibleGroups === undefined || visibleGroups[g.id] !== false,
  );

  return (
    <div className={className ?? "mn-toolbar"} role="toolbar" aria-label="Formatting">
      {visible.map((group, i) => (
        <React.Fragment key={group.id}>
          {i > 0 ? (
            <span className="mn-toolbar-divider" aria-hidden="true" />
          ) : null}
          <div className="mn-toolbar-group" aria-label={group.label}>
            {group.entries.map((entry) => {
              const key =
                entry.kind === "button" ? entry.descriptor.key : group.id + "-" + i;
              return entry.kind === "button" ? (
                <ButtonEntry key={key} entry={entry} />
              ) : (
                <ControlEntry key={key} entry={entry} />
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
