/**
 * Demo storage configuration — the demo consumer's own two-key format
 * (api.spec.md §2.6: "the two-key format (the mock's storage shape) is a
 * first-class option that the demo and parity suite pin, keeping goldens
 * byte-exact against both keys"; behavior.spec.md §4: the storage medium
 * and key names are CONSUMER configuration). The parity goldens'
 * `storage` halves and the flows' `settle()` polling read these strings
 * by name.
 *
 * This module is the single source for the key strings.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import type { StorageFormat } from '@metanorma/panel-layout';

/** Demo layout key. */
export const DEMO_LAYOUT_KEY = 'pl-demo-layout-v1';

/** Demo heights key. */
export const DEMO_HEIGHTS_KEY = 'pl-demo-heights-v1';

/** The demo's two-key storage format (§2.6). */
export const demoStorageFormat: StorageFormat = {
  kind: 'two-key',
  keys: { layout: DEMO_LAYOUT_KEY, heights: DEMO_HEIGHTS_KEY },
};
