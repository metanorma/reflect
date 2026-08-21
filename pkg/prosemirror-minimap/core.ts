/**
 * React-free entry (`@metanorma/prosemirror-minimap/core`, §3.1).
 *
 * Everything except `react.tsx`: a bundler following this entry never
 * resolves the optional React peer.
 */

export { createMinimap, getMinimapController } from './plugin.js';
export { MinimapController } from './controller.js';
export {
  defaultClassifier,
  flatten,
  flattenAll,
  diffRows,
  diffBounds,
} from './blockModel.js';
export type {
  DiffBounds,
  WalkContext,
} from './blockModel.js';
export { keyOf } from './identity.js';
export { textHeight, CalibrationStore } from './heights.js';
export { rowAt } from './geometry.js';
export { InlineRenderer, RecordingRenderer, planPaint } from './renderer.js';
export type { Renderer, DrawCall, TieredRenderer } from './renderer.js';
export { defaultTheme } from './types.js';
export type {
  BlockHoverInfo,
  BlockRow,
  Coords,
  DisplayMode,
  EpochInputs,
  HeightStrategy,
  LayerDeclaration,
  LayerSpan,
  LayerSpans,
  MinimapClassifier,
  MinimapOptions,
  MinimapTheme,
  MinimapTr,
  MinimapView,
  RowSpec,
  ThemeClass,
} from './types.js';
