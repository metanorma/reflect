/**
 * Standing invariant asserts over recorded frames + census.
 *
 * These are asserted in BOTH record and verify mode: the masters capture
 * values, these asserts turn the values into proofs of the mockup invariants
 * (docs/parity.md Part B). When the package adapter arrives (Phase 4), the
 * same asserts run against its frames — that is the parity test.
 *
 * Every assert carries its INV number and the parity.md source. Tolerances
 * are chosen from the mockup's own rounding regime (integer px placements,
 * ≤1px thumb rounding, piecewise-vs-linear deviation bounded by the B′ gap
 * share) — tight enough to fail a real regression, loose enough not to
 * flake on the oracle itself.
 */
import type { Census, Frame } from './types.js';

export interface Violation {
  inv: string;
  where: string;
  detail: string;
}

/** INV-6/7: exact doc-frame scrollable denominator. */
function fracOf(f: Frame): number {
  const range = f.geom.scrollHeight - f.geom.clientHeight - f.geom.docTop0;
  return range > 0 ? (f.scrollTop - f.geom.docTop0) / range : 0;
}

/**
 * Run all frame+census asserts. Returns violations (empty = all hold).
 * `census` is the default-build census captured at the scenario's first
 * frame; frame-level zoom states are checked from frame data only.
 */
export function assertFrames(census: Census, frames: Frame[]): Violation[] {
  const v: Violation[] = [];
  const push = (inv: string, where: string, detail: string) =>
    v.push({ inv, where, detail });

  // ── Build coherence: the mapping asserts (INV-1/4/8/11/16) hold for a
  // minimap build that matches the live layout. Theme switches (contrast
  // reflows the document) and search marks (padding reflows it) change the
  // layout WITHOUT a rebuild — the mock-up has no theme-rebuild path — so
  // frames from such a transition until the next rebuild (any zoom step)
  // or restoration (search-clear) are knowingly build-stale. Their values
  // are still captured byte-exactly in the masters; only the mapping
  // formulas are suspended for them.
  const incoherent = new Set<number>();
  let stale = false;
  for (const f of frames) {
    if (f.step.startsWith('zoom')) stale = false;
    else if (f.step.startsWith('theme') || f.step.startsWith('search q=')) stale = true;
    else if (f.step === 'search-clear') stale = false;
    if (stale) incoherent.add(f.i);
  }
  const coherent = (f: Frame) => !incoherent.has(f.i);

  // ── INV-2 (population): every frame sees the full label population the
  // census recorded — scrolling (and nothing in this suite but a zoom
  // rebuild) may change which labels EXIST; scroll stops never do.
  for (const f of frames) {
    if (f.labelCount !== census.labels.length) {
      push('INV-2', `frame ${f.i} (${f.step})`,
        `label population ${f.labelCount} ≠ census ${census.labels.length}`);
    }
  }

  // ── INV-2 (spine shown-set stability): at a fixed zoom (same canvasH
  // plateau), the shown level-1 labels are the spine (an even sample
  // computed once per build — scrolling never re-samples it). The band
  // pass shows only spine members among lv1 (detail candidates exclude
  // lvl 1); the ONLY sanctioned per-frame deviations are the INV-9
  // active-label reservation, which may force-show ONE non-spine active
  // lv1 and displace ONE victim label within 11px of it (mockup:2280-2296).
  // Sets may therefore differ by at most +1 added / −1 missing — anything
  // else is a re-sampled spine.
  const shownLv1Set = (f: Frame) =>
    new Set(f.labels.filter((l) => l.lv === 1).map((l) => l.text));
  const plateaus = new Map<number, Frame[]>();
  for (const f of frames) {
    const list = plateaus.get(f.geom.canvasH) ?? [];
    list.push(f);
    plateaus.set(f.geom.canvasH, list);
  }
  for (const [h, list] of plateaus) {
    const base = shownLv1Set(list[0]);
    for (const f of list.slice(1)) {
      const here = shownLv1Set(f);
      const missing = [...base].filter((t) => !here.has(t));
      const added = [...here].filter((t) => !base.has(t));
      if (missing.length > 1 || added.length > 1) {
        push('INV-2', `frame ${f.i} (${f.step}) canvasH=${h}`,
          `shown spine set changed beyond the reservation allowance: -${JSON.stringify(missing)} +${JSON.stringify(added)}`);
      }
    }
    // The guaranteed spine minimum holds at every stop of the plateau
    // (the reserved active label may sit on top of it).
    const lv1Count = census.labels.filter((l) => l.lv === 1).length;
    for (const f of list) {
      const n = f.labels.filter((l) => l.lv === 1).length;
      if (n < Math.min(8, lv1Count)) {
        push('INV-2', `frame ${f.i} (${f.step})`,
          `shown lv1 count ${n} < spine minimum ${Math.min(8, lv1Count)}`);
      }
    }
  }

  // ── INV-3 (gap rules): consecutive shown labels respect 11px to a spine
  // (lv1) label, 7px between adjacent details (mockup:2266-2275). Label
  // tops are integer build outputs; a 0.51 tolerance guards float rounding
  // in capture only.
  for (const f of frames) {
    const ls = f.labels;
    for (let k = 1; k < ls.length; k++) {
      const a = ls[k - 1];
      const b = ls[k];
      const gap = b.top - a.top;
      const need = b.lv > 1 && a.lv > 1 ? 7 : 11;
      if (gap < need - 0.51) {
        push('INV-3', `frame ${f.i} (${f.step})`,
          `gap ${gap.toFixed(2)}px < ${need}px between "${a.text}"(lv${a.lv}) and "${b.text}"(lv${b.lv})`);
      }
    }
  }

  // ── INV-9 (active-label reservation): whenever an active block exists,
  // its label is shown and carries .active.
  for (const f of frames) {
    if (!f.activeBlock) continue;
    const active = f.labels.find((l) => l.active);
    if (!active) {
      push('INV-9', `frame ${f.i} (${f.step})`,
        `active block "${f.activeBlock.title}" has no shown .active label`);
    } else if (!f.activeBlock.title.startsWith(active.text + ' ·')) {
      push('INV-9', `frame ${f.i} (${f.step})`,
        `active label "${active.text}" does not identify active block "${f.activeBlock.title}"`);
    }
  }

  // ── INV-5 (piece-local active): at most one active piece; co-pieces
  // exist only alongside an active piece and every co-piece carries the
  // SAME element title as the active piece (the mockup marks .active and
  // .co-piece together on one element's pieces — mockup:2177-2182).
  for (const f of frames) {
    if (f.activeCount > 1) {
      push('INV-5', `frame ${f.i} (${f.step})`, `${f.activeCount} active pieces (max 1)`);
    }
    if (f.coPieceCount > 0 && f.activeCount !== 1) {
      push('INV-5', `frame ${f.i} (${f.step})`,
        `${f.coPieceCount} co-pieces without exactly one active piece (activeCount=${f.activeCount})`);
    }
    if (f.activeCount === 1 && f.activeBlock) {
      const stranger = f.coPieceTitles.filter((t) => t !== f.activeBlock!.title);
      if (stranger.length) {
        push('INV-5', `frame ${f.i} (${f.step})`,
          `co-pieces of another element: ${JSON.stringify(stranger.slice(0, 3))}`);
      }
      if (f.coPieceTitles.length !== f.coPieceCount) {
        push('INV-5', `frame ${f.i} (${f.step})`, 'co-piece title capture inconsistent');
      }
    }
  }

  // ── INV-1/6/7 (shared linear mapping): thumb top = frac × track with the
  // exact doc-frame denominator (scrollHeight − clientHeight − docTop0).
  for (const f of frames) {
    if (!coherent(f)) continue;
    const track = f.geom.paneH - f.thumb.height;
    if (track <= 0) continue;
    const expected = fracOf(f) * track;
    if (Math.abs(f.thumb.top - expected) > 1.51) {
      push('INV-1', `frame ${f.i} (${f.step})`,
        `thumb.top ${f.thumb.top} ≠ frac×track ${expected.toFixed(2)} (frac ${fracOf(f).toFixed(4)})`);
    }
  }

  // ── INV-16 (thumb height = viewport's true share, floored at 8). The
  // mockup's share is measured through the PIECEWISE B′ map (m1−m0), which
  // compresses inter-block whitespace unevenly — measured ~4-7% below the
  // pure-linear H×V/total at this zoom — so the model check carries a
  // documented 12% band. The floor (8px) is exact. (The port's uniform
  // scale makes the model exact — compared via the master diff, not here.)
  for (const f of frames) {
    if (!coherent(f)) continue;
    const expected = Math.max(8, (f.geom.canvasH * f.geom.clientHeight) / f.geom.docHeight);
    if (Math.abs(f.thumb.height - expected) > 0.12 * expected) {
      push('INV-16', `frame ${f.i} (${f.step})`,
        `thumb.height ${f.thumb.height} deviates >12% from max(8, H×V/total) ${expected.toFixed(2)}`);
    }
    if (f.thumb.height < 8) {
      push('INV-16', `frame ${f.i} (${f.step})`, `thumb.height ${f.thumb.height} < 8px floor`);
    }
    if (f.thumb.height > f.geom.paneH) {
      push('INV-16', `frame ${f.i} (${f.step})`, `thumb.height ${f.thumb.height} > paneH ${f.geom.paneH}`);
    }
  }

  // ── INV-8 (content-anchored pan): unclamped, the map behind the thumb IS
  // the reading position: pan + thumbTop = mmDocToMap(s0) ≈ H×s0/total
  // (exactly linear at block starts; B′ piecewise deviation stays within
  // the block's gap share). Monotone across scroll steps within a plateau.
  for (const f of frames) {
    if (!coherent(f)) continue;
    const maxPan = f.geom.canvasH - f.geom.paneH;
    if (f.panY > 0.5 && f.panY < maxPan - 0.5) {
      const s0 = f.scrollTop - f.geom.docTop0;
      const expected = (f.geom.canvasH * s0) / f.geom.docHeight;
      if (Math.abs(f.panY + f.thumb.top - expected) > 2.51) {
        push('INV-8', `frame ${f.i} (${f.step})`,
          `pan+thumb ${f.panY + f.thumb.top} ≠ H×s0/total ${expected.toFixed(2)}`);
      }
    }
    if (f.panY < 0 || f.panY > maxPan + 0.51) {
      push('INV-8', `frame ${f.i} (${f.step})`,
        `panY ${f.panY} outside [0, H−pane=${maxPan.toFixed(1)}]`);
    }
  }
  // Content-anchored position is monotone along a RUN of consecutive
  // scroll-fraction steps at one zoom (a zoom rebuild or any other step
  // breaks the run — e.g. zoom-mid returns to the same canvasH after
  // zoom-reset, which is a NEW plateau in time, not a continuation).
  {
    let prevAnchor = -1;
    let prevFrame = '';
    let prevCanvasH = -1;
    for (const f of frames) {
      if (f.step.startsWith('scroll-fraction') && f.geom.canvasH === prevCanvasH) {
        const anchor = f.panY + f.thumb.top;
        if (prevAnchor >= 0 && coherent(f) && anchor < prevAnchor - 0.01) {
          push('INV-8', `frame ${f.i} (${f.step})`,
            `pan+thumb decreased (${anchor.toFixed(2)} < ${prevAnchor.toFixed(2)} after ${prevFrame})`);
        }
        prevAnchor = anchor;
      } else {
        prevAnchor = -1;
        prevCanvasH = f.step.startsWith('scroll-fraction') ? f.geom.canvasH : -1;
      }
      prevFrame = f.step;
    }
  }

  // ── INV-11 (extent truth at the ends): fraction 0 pins the thumb to the
  // track top; fraction 1 to the track bottom (= maxScroll, INV-1's sweep).
  for (const f of frames) {
    if (!coherent(f)) continue;
    const range = f.geom.scrollHeight - f.geom.clientHeight;
    if (f.step === 'scroll-fraction f=0' || f.step === 'drag-thumb f=0') {
      if (f.thumb.top > 1.01) {
        push('INV-11', `frame ${f.i} (${f.step})`, `thumb.top ${f.thumb.top} ≠ 0 at fraction 0`);
      }
    }
    if (f.step === 'scroll-fraction f=1' || f.step === 'drag-thumb f=1') {
      if (Math.abs(f.thumb.top - (f.geom.paneH - f.thumb.height)) > 1.51) {
        push('INV-11', `frame ${f.i} (${f.step})`,
          `thumb.top ${f.thumb.top} ≠ track bottom ${f.geom.paneH - f.thumb.height} at fraction 1`);
      }
      if (Math.abs(f.scrollTop - range) > 2.01) {
        push('INV-1', `frame ${f.i} (${f.step})`,
          `scrollTop ${f.scrollTop} ≠ maxScroll ${range} after bottom drag`);
      }
    }
  }

  // ── INV-4 (active lookup, observable half): the active piece is the
  // segment ending after the viewport centre — in map space the centre
  // lands inside the active piece's extent (± B′ piecewise-vs-linear
  // deviation, bounded by the MIN floor and gap shares).
  for (const f of frames) {
    if (!coherent(f) || !f.activeBlock) continue;
    const centerMap =
      (f.geom.canvasH * (f.scrollTop - f.geom.docTop0 + f.geom.clientHeight / 2)) /
      f.geom.docHeight;
    const { top, height } = f.activeBlock;
    if (centerMap < top - 4.01 || centerMap > top + height + 5.01) {
      push('INV-4', `frame ${f.i} (${f.step})`,
        `viewport centre maps to ${centerMap.toFixed(1)} but active piece spans [${top}, ${top + height}]`);
    }
  }

  // ── INV-13 (zoom-preserving rebuild): across a zoom / zoom-reset step
  // the doc-frame scroll fraction is restored (± the scrollTop integer
  // round, ≤ ~0.1% of range).
  for (let k = 1; k < frames.length; k++) {
    const prev = frames[k - 1];
    const f = frames[k];
    if (f.step.startsWith('zoom') && prev.step.startsWith('scroll-fraction')) {
      const d = Math.abs(fracOf(prev) - fracOf(f));
      if (d > 0.002) {
        push('INV-13', `frame ${f.i} (${f.step})`,
          `scroll fraction moved ${d.toFixed(4)} across zoom rebuild`);
      }
    }
  }

  // ── A.8 wear row (geometry invariance): a dwell step changes nothing the
  // minimap reflects except wear opacity (which frames exclude by design).
  for (let k = 1; k < frames.length; k++) {
    if (frames[k].step.startsWith('dwell')) {
      const a = JSON.stringify({ ...frames[k - 1], i: 0, step: '', label: undefined });
      const b = JSON.stringify({ ...frames[k], i: 0, step: '', label: undefined });
      if (a !== b) {
        push('A.8-wear', `frame ${frames[k].i} (${frames[k].step})`,
          'geometry changed across a dwell step (wear may only touch opacity)');
      }
    }
  }

  // ── Census asserts (default build) ─────────────────────────────────────

  // INV-10 (proportional tiling): blocks start at 0, end at H, never
  // overlap out of order (tops non-decreasing).
  const blocks = census.blocks;
  if (blocks.length) {
    if (blocks[0].top !== 0) {
      push('INV-10', 'census', `first block top ${blocks[0].top} ≠ 0`);
    }
    const last = blocks[blocks.length - 1];
    const bottom = last.top + last.height + 1; // height = max(2, m1−m0−1)
    if (Math.abs(bottom - census.geom.canvasH) > 3.01) {
      push('INV-10', 'census',
        `last block bottom ${bottom} ≠ canvasH ${census.geom.canvasH}`);
    }
    for (let k = 1; k < blocks.length; k++) {
      if (blocks[k].top < blocks[k - 1].top - 0.01) {
        push('INV-10', `census block ${k}`, `top ${blocks[k].top} < previous ${blocks[k - 1].top}`);
      }
    }
  }

  // INV-15 (marker floors): lane ticks never paint below their floor
  // (mockup: 5px lanes, 3px wear) and diag/com/search clamp at 14px.
  for (const [lane, ticks] of Object.entries(census.laneTicks)) {
    for (const t of ticks) {
      if (lane === 'wear') {
        if (t.height < 3) {
          push('INV-15', `census wear tick @${t.top}`, `height ${t.height} < 3px floor`);
        }
      } else if (t.height < 5 || t.height > 14) {
        push('INV-15', `census ${lane} tick @${t.top}`, `height ${t.height} outside [5,14]`);
      }
    }
    // Worst-case rects per lane ≤ canvasH / floor.
    const floor = lane === 'wear' ? 3 : 5;
    if (ticks.length > census.geom.canvasH / floor + 1) {
      push('INV-15', `census lane ${lane}`,
        `${ticks.length} ticks > canvasH/floor ${census.geom.canvasH / floor}`);
    }
  }

  // INV-19 (spine sizing, observable half): spine sample = max(8, min(15,
  // lvl1Count)) — every lv1 label that is EVER shown is a census lv1
  // label, and the per-frame shown-lv1 count never exceeds 15 spine slots
  // + 1 reserved active label (INV-9).
  const lv1Texts = new Set(census.labels.filter((l) => l.lv === 1).map((l) => l.text));
  for (const f of frames) {
    for (const l of f.labels) {
      if (l.lv === 1 && !lv1Texts.has(l.text)) {
        push('INV-19', `frame ${f.i} (${f.step})`, `shown lv1 "${l.text}" not in census population`);
      }
    }
    const n = f.labels.filter((l) => l.lv === 1).length;
    if (n > 16) {
      push('INV-19', `frame ${f.i} (${f.step})`,
        `shown lv1 count ${n} > 15 spine slots + 1 reserved active`);
    }
  }

  return v;
}
