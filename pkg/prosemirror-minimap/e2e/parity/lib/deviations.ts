/**
 * Deviation-aware diffing.
 *
 * The mockup masters are the parity baseline. Later phases will legitimately
 * diverge from the baseline in bounded, reviewed ways (the `deviate` rows of
 * docs/parity.md Part A). The differ therefore does NOT require strict
 * equality of everything: before comparing a leaf it consults
 * `deviations.json` — a committed register whose entries may skip a path or
 * widen its numeric tolerance. With an empty register the differ is strict,
 * which is the state this phase ships.
 *
 * Schema (deviations.json) — see DEVIATIONS.md for the full contract:
 *
 * {
 *   "$format": 1,
 *   "deviations": [
 *     {
 *       "id": "DEV-1",                     // unique, cited by PRs/docs
 *       "appliesTo": "package",            // which adapter may claim it
 *       "reason": "...",                   // required — why the divergence
 *                                          // is legitimate (parity.md row)
 *       "scenario": "zoom-mid",            // optional filter: scenario name
 *       "step": "zoom px=7900",            // optional filter: step echo
 *       "path": "thumb.height",            // dotted path; '*' matches any
 *                                          // single segment
 *       "action": { "type": "skip" }
 *                    | { "type": "tolerance", "value": 1.5 }
 *                    | { "type": "round", "decimals": 1 }
 *     }
 *   ]
 * }
 *
 * First matching entry wins. A deviation entry NEVER applies to the mockup
 * adapter's own re-verification (`appliesTo: "package"`): the oracle must
 * stay strict against itself.
 */
import fs from 'node:fs';
import { DEVIATIONS_PATH } from './env.js';

export interface DeviationAction {
  type: 'skip' | 'tolerance' | 'round';
  /** tolerance: max |expected − actual|; round: compare after rounding. */
  value?: number;
  decimals?: number;
}

export interface DeviationEntry {
  id: string;
  appliesTo: 'package';
  reason: string;
  scenario?: string;
  step?: string;
  path: string;
  action: DeviationAction;
}

export interface DeviationRegister {
  $format: 1;
  deviations: DeviationEntry[];
}

export function loadRegister(): DeviationRegister {
  const raw = JSON.parse(fs.readFileSync(DEVIATIONS_PATH, 'utf8'));
  if (raw.$format !== 1) {
    throw new Error(`deviations.json: unsupported $format ${raw.$format}`);
  }
  const ids = new Set<string>();
  for (const d of raw.deviations as DeviationEntry[]) {
    if (ids.has(d.id)) throw new Error(`deviations.json: duplicate id ${d.id}`);
    ids.add(d.id);
    if (!d.reason) {
      throw new Error(`deviations.json: entry ${d.id} must carry a reason`);
    }
    if (d.action.type === 'tolerance' && typeof d.action.value !== 'number') {
      throw new Error(`deviations.json: ${d.id} tolerance needs a value`);
    }
    if (d.action.type === 'round' && typeof d.action.decimals !== 'number') {
      throw new Error(`deviations.json: ${d.id} round needs decimals`);
    }
  }
  return raw as DeviationRegister;
}

/** Does a register entry's filters match this comparison context? */
function entryMatches(
  e: DeviationEntry,
  ctx: { adapter: string; scenario: string; step: string },
  leafPath: string[],
): boolean {
  if (e.appliesTo !== ctx.adapter) return false;
  if (e.scenario !== undefined && e.scenario !== ctx.scenario) return false;
  if (e.step !== undefined && e.step !== ctx.step) return false;
  const want = e.path.split('.');
  if (want.length !== leafPath.length) return false;
  return want.every((seg, k) => seg === '*' || seg === leafPath[k]);
}

export interface DiffNote {
  path: string;
  expected: unknown;
  actual: unknown;
  /** Set when a deviation entry covered this leaf but still failed. */
  deviation?: string;
}

export interface DiffResult {
  /** The verdict: true when every leaf is equal (or within a registered
   *  tolerance). Byte-equality is reported separately. */
  equal: boolean;
  /** True iff the canonical serializations are byte-identical — the strict
   *  determinism proof. False once legitimate deviations exist. */
  byteStable: boolean;
  diffs: DiffNote[];
  tolerated: number;
}

type Ctx = { adapter: string; scenario: string; step: string };

function compareLeaf(
  path: string[],
  expected: unknown,
  actual: unknown,
  ctx: Ctx,
  register: DeviationRegister,
  out: { diffs: DiffNote[]; tolerated: number },
): void {
  const joined = path.join('.');
  for (const e of register.deviations) {
    if (!entryMatches(e, ctx, path)) continue;
    if (e.action.type === 'skip') {
      out.tolerated++;
      return;
    }
    if (e.action.type === 'round' && typeof expected === 'number' && typeof actual === 'number') {
      const d = e.action.decimals ?? 0;
      const round = (v: number) => Math.round(v * 10 ** d) / 10 ** d;
      if (round(expected) === round(actual)) {
        out.tolerated++;
        return;
      }
      out.diffs.push({ path: joined, expected, actual, deviation: e.id });
      return;
    }
    if (e.action.type === 'tolerance' && typeof expected === 'number' && typeof actual === 'number') {
      if (Math.abs(expected - actual) <= (e.action.value ?? 0)) {
        out.tolerated++;
        return;
      }
      out.diffs.push({ path: joined, expected, actual, deviation: e.id });
      return;
    }
  }
  if (expected === actual) return;
  out.diffs.push({ path: joined, expected, actual });
}

function deepCompare(
  path: string[],
  expected: unknown,
  actual: unknown,
  ctx: Ctx,
  register: DeviationRegister,
  out: { diffs: DiffNote[]; tolerated: number },
): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      compareLeaf(path, expected, actual, ctx, register, out);
      return;
    }
    expected.forEach((v, k) => deepCompare([...path, String(k)], v, (actual as unknown[])[k], ctx, register, out));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      compareLeaf(path, expected, actual, ctx, register, out);
      return;
    }
    const eKeys = Object.keys(expected as Record<string, unknown>);
    const aKeys = Object.keys(actual as Record<string, unknown>);
    for (const k of eKeys) {
      deepCompare([...path, k], (expected as Record<string, unknown>)[k], (actual as Record<string, unknown>)[k], ctx, register, out);
    }
    for (const k of aKeys) {
      if (!(k in (expected as Record<string, unknown>))) {
        out.diffs.push({ path: [...path, k].join('.'), expected: '<absent>', actual: (actual as Record<string, unknown>)[k] });
      }
    }
    return;
  }
  compareLeaf(path, expected, actual, ctx, register, out);
}

/**
 * Diff `actual` against `expected` (a recorded master's contents), consulting
 * the deviation register for leaves that are allowed to diverge.
 */
export function diffMaster(
  expected: unknown,
  actual: unknown,
  ctx: Ctx,
  register: DeviationRegister,
): DiffResult {
  const out = { diffs: [] as DiffNote[], tolerated: 0 };
  deepCompare([], expected, actual, ctx, register, out);
  return {
    equal: out.diffs.length === 0,
    byteStable: JSON.stringify(expected) === JSON.stringify(actual),
    diffs: out.diffs,
    tolerated: out.tolerated,
  };
}
