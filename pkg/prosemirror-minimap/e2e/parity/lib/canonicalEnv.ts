/**
 * Canonical-environment fingerprint for golden masters.
 *
 * Masters are byte-stable only in the environment that recorded them
 * (layout is font- and engine-dependent). Every master carries this
 * fingerprint, and verify mode REFUSES to diff when the live environment
 * differs — environment drift can never be absorbed as hand-widened
 * tolerances; it is a re-record decision for the gate.
 */
import os from 'node:os';
import type { Page } from '@playwright/test';
import type { MasterEnv } from './types.js';

/** The document font stack the baseline mock-up's layout depends on
 *  (`#doc` is Georgia-first serif; UI chrome is system sans). Availability
 *  of any family changes metrics and therefore every recorded px. */
const FONT_PROBES: Array<[string, string]> = [
  ['georgia', '17px Georgia'],
  ['iowanOldStyle', '17px "Iowan Old Style"'],
  ['timesNewRoman', '17px "Times New Roman"'],
  ['menlo', '12px Menlo'],
  ['segoeUI', '13px "Segoe UI"'],
];

export async function captureEnv(page: Page): Promise<MasterEnv> {
  const browser = page.context().browser();
  const vp = page.viewportSize();
  const fonts = await page.evaluate((probes) => {
    const out: Record<string, boolean> = {};
    for (const [k, spec] of probes as Array<[string, string]>) {
      try {
        out[k] = document.fonts.check(spec);
      } catch {
        out[k] = false;
      }
    }
    return out;
  }, FONT_PROBES);
  return {
    viewport: [vp?.width ?? 0, vp?.height ?? 0],
    reducedMotion: 'reduce',
    browser: browser ? `${browser.browserType().name()} ${browser.version()}` : 'unknown',
    platform: os.platform(),
    arch: os.arch(),
    fonts,
    note:
      'Canonical recording environment: this fingerprint must match byte-for-byte in verify mode. Re-recording elsewhere is a gate decision (see README "Canonical environment").',
  };
}

/** Human-readable env-equality failure for the verify gate. */
export function envMismatch(recorded: MasterEnv, live: MasterEnv): string[] {
  const diffs: string[] = [];
  for (const key of Object.keys(recorded) as Array<keyof MasterEnv>) {
    if (JSON.stringify(recorded[key]) !== JSON.stringify(live[key])) {
      diffs.push(
        `${key}: recorded ${JSON.stringify(recorded[key])} ≠ live ${JSON.stringify(live[key])}`,
      );
    }
  }
  return diffs;
}
