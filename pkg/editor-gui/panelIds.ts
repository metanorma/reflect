/**
 * editor-gui's panel-id set — the single source shared by the registry
 * (the compile-time `satisfies` tie in `panels.tsx`), the preset's
 * `panels` map (`presetLayout.ts` iterates it), and the Node preset
 * tests (runtime membership). Zero imports by design: compiled to
 * `compiled/panelIds.js`, it stays loadable under plain Node.
 */
export const PANEL_IDS = ['doc', 'minimap', 'toolbar'] as const;

export type PanelId = (typeof PANEL_IDS)[number];
