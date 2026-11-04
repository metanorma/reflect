/**
 * Per-panel error boundary (api.spec.md §3 module 8) — behavior.spec.md
 * row C3, the minimum exactly: a consumer panel component that throws in
 * render shows an inline "Panel failed: <id>" state instead of unmounting
 * the whole layout (dockview-react v7.0.4 ships no error boundary of its
 * own — the tree dies to a blank page without one).
 *
 * GREENFIELD MODULE (the inventory's only planned-module row with no mock
 * provenance: C3 is the mock's documented gap, not a port). Scope is the
 * row's "min:" cell and nothing more — no retry affordance, no reset API,
 * no error surfacing beyond a console.error diagnostic line.
 *
 * The fallback is a bare, classless <div> ("Panel failed: <id>"): it must
 * exist inside the D1/D2 fixed-height box, and inventing CSS for it is out
 * of bounds (theming is module 10's; nothing here may mint new classes).
 *
 * `wrapPanelComponent` is the api.spec.md §2.5 registry-application seam —
 * module 1 wraps each registry component with it. It is INTERNAL-ONLY
 * (exported via `internal.ts`, never `index.ts`): the §3 row-8 public
 * budget stays exactly `PanelErrorBoundary`.
 */

import React from 'react';
import type { FC, ReactNode } from 'react';
import type { IDockviewPanelProps } from 'dockview';

export interface PanelErrorBoundaryProps {
  /** Panel id (dockview `api.id`) carried into the fallback line. */
  readonly panelId: string;
  readonly children?: ReactNode;
}

interface PanelErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * Wraps one consumer panel; a render throw inside the child renders the
 * C3 fallback line instead of unmounting the layout tree.
 */
export class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  /**
   * Explicit initializer — REQUIRED: the base `React.Component`
   * constructor leaves `state` null, so a boundary that relies on the
   * derived-state path alone crashes on its first healthy render
   * (`this.state.failed` on null). Verified against react 19.2.7.
   */
  override state: PanelErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(`panel render failed (${this.props.panelId})`, error);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <div>Panel failed: {this.props.panelId}</div>;
    }
    return this.props.children;
  }
}

/**
 * Wrap one registry component (§2.5) so its panels render inside a
 * {@link PanelErrorBoundary}. The panel id comes from dockview's
 * `IDockviewPanelProps.api.id` — the only dockview knowledge module 8
 * carries, and it is type-only (erases at emit).
 *
 * INTERNAL-ONLY (via `internal.ts`) — the public row-8 budget is the
 * boundary itself.
 */
export function wrapPanelComponent(
  component: FC<IDockviewPanelProps>,
): FC<IDockviewPanelProps> {
  return function guarded(props: IDockviewPanelProps) {
    return (
      <PanelErrorBoundary panelId={props.api.id}>
        {React.createElement(component, props)}
      </PanelErrorBoundary>
    );
  };
}
