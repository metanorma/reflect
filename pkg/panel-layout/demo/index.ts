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
 * The demo's stylesheet is `demo/panel-content.css` (the panel-content CSS
 * migrated from the mock's inline style); the app-chrome CSS (toolbar/
 * statusbar/boot/shell) remains host-owned — the reference mock keeps it
 * inline (D35; where it lives for a host other than the mock is the twin
 * loop's decision, not pre-solved here).
 */

export { DemoApp } from './DemoApp.js';
export { DemoStatusbar, DemoToolbar } from './chrome.js';
export { registry as demoRegistry } from './registry.js';
export { presetLayout } from './preset.js';
export {
  DEMO_HEIGHTS_KEY,
  DEMO_LAYOUT_KEY,
  demoStorageFormat,
} from './storage.js';
