/**
 * Public API for `@metanorma/prosemirror-minimap` (§13).
 *
 * Implements `docs/ProseMirrorMinimap.spec.md` — a schema-agnostic,
 * block-level, canvas-rendered document minimap for ProseMirror editors.
 *
 * Everything in `./core` (the React-free entry, §3.1) plus the `Minimap`
 * React component.
 */

export * from './core.js';
export { Minimap } from './react.js';
export type { MinimapProps } from './react.js';