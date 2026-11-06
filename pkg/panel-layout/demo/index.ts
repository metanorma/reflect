/**
 * `@metanorma/panel-layout/demo` — the demo surface (D38): a SUBPATH
 * EXPORT that ships with the package but adds NO library API. It assembles
 * the reference mock's residual demo material — the 11 panel bodies, the
 * registry, the preset layout, the storage keys, and the toolbar/statusbar
 * chrome — around the library's public `<PanelLayout>` front door, so a
 * consumer mounts ONE component (`DemoApp`) to reproduce the reference
 * editor. Everything here is CONSUMER code: it consumes only the public
 * API ('@metanorma/panel-layout') plus the react peer — never
 * `internal.ts` (check-imports scans this directory as consumer code).
 *
 * The demo's stylesheets are `demo/panel-content.css` (panel-content CSS
 * migrated from the mock's inline style) and `demo/app-chrome.css`
 * (toolbar/statusbar/boot/shell, D50: hosts link both; the mock links
 * them too — its inline `<style>` is comment-only).
 *
 * Consumer-mount seam (D51, escalation E2): this surface also exports
 * `mountDemoApp(root)` — createRoot().render(DemoApp) over this
 * package's own react peers. Hosts with NO react of their own mount
 * through it: the twin parity page loads the fully-bundled
 * /dist/twin/panel-layout-demo.js, whose react/react-dom are
 * closure-internal, so a host-side createRoot() would be a SECOND
 * instance and crash at DemoApp's first hook (per-copy React internals).
 * Hosts that DO supply the peers externally (the reference mock's
 * importmap flavor) may keep mounting `DemoApp` directly, exactly as
 * before — there createRoot resolves through the importmap.
 */
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

import { DemoApp } from './DemoApp.js';

export { DemoApp } from './DemoApp.js';
export { DemoStatusbar, DemoToolbar } from './chrome.js';
export { registry as demoRegistry } from './registry.js';
export { presetLayout } from './preset.js';
export {
  DEMO_HEIGHTS_KEY,
  DEMO_LAYOUT_KEY,
  demoStorageFormat,
} from './storage.js';

/**
 * The consumer-mount seam (D51): mounts `DemoApp` on the given root
 * element using this surface's own react/react-dom peers — the mount
 * path for hosts whose react is the bundled copy itself (the twin
 * flavor; see the header). Idempotence is the caller's concern (one
 * mount per root, as with any createRoot).
 */
export function mountDemoApp(root: HTMLElement): void {
  createRoot(root).render(h(DemoApp));
}
