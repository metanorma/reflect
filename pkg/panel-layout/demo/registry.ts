/**
 * Demo panel registry — the demo consumer's registrations (api.spec.md
 * §2.5 keying, D33 policy placement). Translated VERBATIM from the
 * reference mock's `registry` (mock :714–738):
 *
 * - key = the serialized `contentComponent` name ('document' renders the
 *   doc panel; the other ten reuse their panel ids);
 * - `floatable: false` is registry-authoritative BEHAVIORAL policy, and
 *   `floatExcludedPanels(registry)` yields PANEL IDS — the doc panel's id
 *   is 'doc' (golden-pinned), so the policy entry rides the 'doc' key;
 *   its component is never resolved (no panel carries contentComponent
 *   'doc'), only the exclusion flag is read from it;
 * - `title` is data precedence rung 2 (layout wins — the preset carries
 *   every title); the mock's registry sets none, so neither does this one.
 *
 * The components registered here are RAW consumer components: the library
 * wraps every registry entry through its own error-boundary seam (D23) —
 * `registryComponents()` in panelLayout.tsx. The demo never wraps.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import type { PanelRegistry } from '@metanorma/panel-layout';

import { DocumentPanel, panelComponent } from './panels.js';

export const registry: PanelRegistry = {
  outline: { component: panelComponent('outline') },
  bibliography: { component: panelComponent('bibliography') },
  validation: { component: panelComponent('validation') },
  review: { component: panelComponent('review') },
  pinned: { component: panelComponent('pinned') },
  identity: { component: panelComponent('identity') },
  attributes: { component: panelComponent('attributes') },
  structure: { component: panelComponent('structure') },
  derived: { component: panelComponent('derived') },
  overlays: { component: panelComponent('overlays') },
  document: { component: DocumentPanel },
  // F3 float exclusion, expressed by PANEL ID (see header).
  doc: { component: DocumentPanel, floatable: false },
};
