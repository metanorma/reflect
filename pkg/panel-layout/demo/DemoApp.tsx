/**
 * `DemoApp` — the demo consumer's one-component assembly : the
 * toolbar/statusbar chrome around a single `<PanelLayout>` instantiation,
 * fed the demo registry, preset and two-key persistence. Translated
 * VERBATIM from the reference mock's `App()` — the same
 * prop bag the mock passed, the same Reset body (HP9: wipe keys → clear →
 * fromJSON(preset) — the library's fromJSON net clears the pin map and the
 * maintenance pass re-pins + re-saves), the same `window.__api` hook
 * the parity drivers read live state through.
 *
 * Everything here must be possible for a third party importing
 * '@metanorma/panel-layout' (plus the react peer): it is CONSUMER code.
 * `dockviewOptions` passes `theme` + `dndEdges` (consumer passthrough) and
 * the mock's `floatingGroupBounds` — which the library OWNS and ignores
 * (§2.1); it is kept verbatim from the mock for fidelity.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import { createElement as h, useState } from 'react';
import type { FC } from 'react';
import {
  PanelLayout,
} from '@metanorma/panel-layout';
import type {
  PanelLayoutApi,
  PanelLayoutFallbackEvent,
} from '@metanorma/panel-layout';

import { DemoToolbar, DemoStatusbar } from './chrome.js';
import { registry } from './registry.js';
import { presetLayout } from './preset.js';
import {
  DEMO_HEIGHTS_KEY,
  DEMO_LAYOUT_KEY,
  demoStorageFormat,
} from './storage.js';

/** The engine api the parity drivers read through (`window.__api`). */
interface ApiWindow { __api?: PanelLayoutApi }

export const DemoApp: FC = () => {
  const [autoWrap, setAutoWrap] = useState(true);
  // C2 (behavior.spec.md §3): under storage failure the statusbar's
  // 'layout saved' claim is false — the library signals
  // 'storage-unavailable' once per session (§2.2) and the demo swaps the
  // tail text. Never fires in the parity environment (localStorage is
  // writable there), so the goldens pin the default string.
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  const onReady = ({ api }: { api: PanelLayoutApi }) => {
    (window as unknown as ApiWindow).__api = api;   // parity drivers read live state through it
  };

  const onDidFallback = (event: PanelLayoutFallbackEvent) => {
    if (event.reason === 'storage-unavailable') {
      setStorageUnavailable(true);
    }
  };

  const reset = () => {
    // HP9 restore-to-default: the demo wipes its keys, then restores the
    // preset through the public api — the library's fromJSON net clears the
    // pin map, and the maintenance pass re-pins + re-saves (both keys
    // re-emerge: layout = preset, heights = {}).
    const w = (window as unknown as ApiWindow).__api;
    try { localStorage.removeItem(DEMO_LAYOUT_KEY); localStorage.removeItem(DEMO_HEIGHTS_KEY); } catch { /* C2: storage unavailable */ }
    w?.clear();
    w?.fromJSON(presetLayout());
  };

  return h('div', { className: 'window' },
    h(DemoToolbar, {
      autoWrap,
      onToggleAutoWrap: () => setAutoWrap(v => !v),
      onReset: reset,
    }),
    // The PanelLayout container IS the layout area — it carries the
    // class itself; the demo's .layoutArea CSS (flex:1 fill) applies to it.
    h(PanelLayout, {
      registry,
      defaultLayout: presetLayout(),
      persistence: {
        defaultLayout: presetLayout(),
        format: demoStorageFormat,
      },
      autoWrap,
      dockviewOptions: {
        theme: {
          name: 'light',
          className: 'dockview-theme-light',
          colorScheme: 'light',
        },
        // drag containment — everything but the bottom edge: the
        // vertical/horizontal stock clamps are disabled via 0-minimums
        // (no-op clamp range; the value is OWNED by the library per §2.1
        // and ignored here — kept from the mock verbatim as the design
        // source of truth) and the library's transform re-imposes
        // top/left bounds per frame, leaving the bottom free.
        floatingGroupBounds: {
          minimumHeightWithinViewport: 0,
          minimumWidthWithinViewport: 0,
        },
        dndEdges: {
          size: { value: 160, type: 'pixels' },
          activationSize: { value: 26, type: 'pixels' },
        },
      },
      onReady,
      onDidFallback,
    }),
    h(DemoStatusbar, { storageUnavailable }));
};
