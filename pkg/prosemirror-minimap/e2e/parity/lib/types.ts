/**
 * Parity types — the engine-agnostic contract shared by scenario fixtures,
 * drivers, master files and the differ (Phase 2 oracle construction).
 *
 * The scenario vocabulary is deliberately engine-agnostic: a later phase can
 * drive the PACKAGE harness page (`/index.html`, `window.__mnMount`) with the
 * same JSON scripts by implementing a second `MinimapAdapter`. Steps name
 * user-level intents (scroll, jump, zoom, dwell, lane toggle, thumb drag),
 * never implementation internals.
 */

// ── Scenario steps ─────────────────────────────────────────────────────

export type LaneKey = 'diag' | 'com' | 'search' | 'wear';

export type ScenarioStep =
  /** Reset the scroll container to the document top (always step 0 in
   *  practice — every scenario starts deterministic). */
  | { type: 'reset'; label?: string }
  /** Set the scroll position to a fraction f ∈ [0,1] of the exact doc-frame
   *  scrollable range (the mockup's `mmScrollableDoc` denominator). */
  | { type: 'scroll-fraction'; f: number; label?: string }
  /** Reveal the element with this anchor, centered (the code path every
   *  mockup navigation helper uses: `scrollIntoView({block:'center'})`). */
  | { type: 'jump'; anchor: string; label?: string }
  /** Resize the minimap window to a target canvas height in px by dragging
   *  the real grip element with mouse events (the only code path there is). */
  | { type: 'zoom'; px: number; label?: string }
  /** Double-click the grip: reset to the default detail (~1:8) zoom. */
  | { type: 'zoom-reset'; label?: string }
  /** Dwell at the current position for ms. In master scenarios this asserts
   *  geometry invariance under the wear ticker; the clock-driven wear spec
   *  advances the mocked clock by exactly `ms` instead of sleeping. */
  | { type: 'dwell'; ms: number; label?: string }
  /** Toggle a lane's visibility through the legend control. */
  | { type: 'lane-toggle'; lane: LaneKey; label?: string }
  /** Drag the viewport thumb so its top lands at fraction f of the thumb
   *  track (pointer events on the real thumb element). */
  | { type: 'drag-thumb'; f: number; label?: string }
  /** Cycle the UI theme (light → dark → contrast) by clicking the real
   *  theme button until `data-theme` equals `to`. Contrast is a GEOMETRY
   *  dimension (2px borders change document heights), not just color. */
  | { type: 'theme'; to: 'light' | 'dark' | 'contrast'; label?: string }
  /** Run the mock-up's in-document search (⌘F code path): opens the bar,
   *  types the query, presses Enter — populates the search lane with ticks
   *  and reveals the first hit. */
  | { type: 'search'; query: string; label?: string }
  /** Clear the search (Escape code path): unwraps hits, empties the lane. */
  | { type: 'search-clear'; label?: string }
  /** Press a key on the minimap focus host (landmark walking — mock-up
   *  side). The PACKAGE-side semantics of arrow keys are pending Q8 at the
   *  gate; the step type exists so fixture scenarios can record the
   *  mock-up behavior now. */
  | { type: 'key'; key: 'ArrowDown' | 'ArrowUp'; label?: string }
  /** Resize the browser viewport (changes the grid-set pane AND fires the
   *  mock-up's unconditional window-resize rebuild). Width changes also
   *  reflow the document — an epoch-class change. */
  | { type: 'viewport'; width?: number; height?: number; label?: string };

export type StepType = ScenarioStep['type'];

export interface Scenario {
  /** Scenario id — also the master filename (`masters/<name>.json`). */
  name: string;
  description: string;
  /** Which adapter the scenario was authored against. Scenarios stay
   *  adapter-agnostic; this is provenance only. */
  adapter: string;
  steps: ScenarioStep[];
}

// ── Geometry frame (JSON, never pixels) ────────────────────────────────

export interface FrameLabel {
  text: string;
  /** Label's canvas-space top (`style.top`, px). */
  top: number;
  /** Level class 1..7 (`lv1`..`lv7`). */
  lv: number;
  active: boolean;
}

export interface FrameLane {
  off: boolean;
  tickCount: number;
  /** Full tick geometry for the low-count lanes (diag/com/search); the wear
   *  lane carries count only per frame — its full geometry lives in the
   *  census (210+ ticks × 20+ frames would swamp the master). */
  ticks?: Array<{ top: number; height: number }>;
}

export interface Frame {
  /** Step index this frame was captured after (0-based). */
  i: number;
  /** Human-readable step echo, e.g. `scroll-fraction f=0.35`. */
  step: string;
  label?: string;
  /** Scroll container's `scrollTop` (raw px). */
  scrollTop: number;
  /** Snapshot of the scroll/pane constants the mapping depends on. */
  geom: {
    scrollHeight: number;
    clientHeight: number;
    /** `#doc.offsetTop` — the doc-frame origin (mockup fix #3). */
    docTop0: number;
    docHeight: number;
    /** Panning canvas height `H` (the zoom variable). */
    canvasH: number;
    /** `#mmBody.clientHeight` — the visible pane height. */
    paneH: number;
  };
  /** Viewport thumb: `#mmVpBox` style top/height (px). */
  thumb: { top: number; height: number };
  /** Panning canvas translateY magnitude (px, positive down-shift). */
  panY: number;
  /** Labels with `.show`, sorted by (top, text). */
  labels: FrameLabel[];
  /** Total labels in the DOM (population — must be build-stable). */
  labelCount: number;
  /** The `.blk.active` element's identity + piece geometry, or null. */
  activeBlock: { title: string; type: string; top: number; height: number } | null;
  activeCount: number;
  coPieceCount: number;
  /** Titles of every `.blk.co-piece` (sorted) — INV-5's observable: all
   *  co-pieces belong to the same element as the active piece. */
  coPieceTitles: string[];
  blockCount: number;
  lanes: Record<string, FrameLane>;
}

// ── Census (once per scenario run) ─────────────────────────────────────

export interface CensusLabel {
  text: string;
  top: number;
  lv: number;
}

export interface CensusBlock {
  title: string;
  type: string;
  top: number;
  height: number;
  left: number;
}

export interface Census {
  /** Every label div (shown or not), sorted by (top, text) — the population
   *  INV-2 (spine viewport-independence) keeps stable across scroll stops. */
  labels: CensusLabel[];
  /** Every strip rect `.blk`, sorted by top. */
  blocks: CensusBlock[];
  /** Full tick geometry per lane (incl. wear) — INV-15 floor checks. */
  laneTicks: Record<string, Array<{ top: number; height: number }>>;
  geom: Frame['geom'];
}

// ── Master file ────────────────────────────────────────────────────────

/**
 * The canonical recording environment. Masters are byte-stable ONLY here;
 * the differ refuses to compare across environments (see masters.parity.ts)
 * so drift can never be absorbed as hand-widened tolerances. Re-recording
 * in a different environment is a gate decision, not a local fix.
 */
export interface MasterEnv {
  viewport: [number, number];
  reducedMotion: 'reduce';
  /** Chromium build (`chromium <version>`) — layout engine identity. */
  browser: string;
  /** `os.platform()`/`os.arch()` of the recording machine. */
  platform: string;
  arch: string;
  /** Font-availability fingerprint: `document.fonts.check` for the mock-up's
   *  document stack (Georgia serif body etc.) — the availability of any of
   *  them changes document layout and therefore every recorded px. */
  fonts: Record<string, boolean>;
  /** Static pin: masters are recorded under emulated reduced motion, fixed
   *  viewport, seeded localStorage. No timestamps — byte-stability. */
  note: string;
}

export interface MasterFile {
  /** 2 — environment fingerprint added (browser/platform/arch/fonts) and
   *  verified before any diff. */
  format: 2;
  scenario: string;
  adapter: string;
  env: MasterEnv;
  census: Census;
  frames: Frame[];
}

// ── Adapter interface (engine-agnostic driver) ─────────────────────────

import type { Page } from '@playwright/test';

/**
 * A driver that can load a page and execute scenario steps against one
 * minimap implementation. The mockup adapter (this phase) probes the frozen
 * mockup's DOM only — never closure internals (`mmS` is not on `window`).
 * The Phase-4 package adapter implements the same interface against the
 * harness mount, with no fixture changes.
 */
export interface MinimapAdapter {
  readonly id: string;
  /** Navigate + seed + settle. Called once per scenario run. */
  load(page: Page, opts?: { clock?: boolean }): Promise<void>;
  /** Execute one step. `i` is the step index (for reporting). */
  applyStep(page: Page, step: ScenarioStep, i: number): Promise<void>;
  /** Capture the geometry frame for the current state. */
  captureFrame(page: Page, i: number, step: ScenarioStep): Promise<Frame>;
  /** Capture the (build-stable) census of DOM population. */
  captureCensus(page: Page): Promise<Census>;
}

export function stepEcho(step: ScenarioStep): string {
  switch (step.type) {
    case 'scroll-fraction': return `scroll-fraction f=${step.f}`;
    case 'jump': return `jump anchor=${step.anchor}`;
    case 'zoom': return `zoom px=${step.px}`;
    case 'zoom-reset': return 'zoom-reset';
    case 'dwell': return `dwell ms=${step.ms}`;
    case 'lane-toggle': return `lane-toggle lane=${step.lane}`;
    case 'drag-thumb': return `drag-thumb f=${step.f}`;
    case 'theme': return `theme to=${step.to}`;
    case 'search': return `search q="${step.query}"`;
    case 'search-clear': return 'search-clear';
    case 'key': return `key ${step.key}`;
    case 'viewport': return `viewport ${step.width ?? ''}x${step.height ?? ''}`;
    default: return step.type;
  }
}
