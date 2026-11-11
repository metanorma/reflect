# Deviation register schema (`deviations.json`)

The parity differ (`lib/deviations.ts`) compares a live run of a scenario
against the recorded mockup master (`masters/<scenario>.json`). With an empty
register the comparison is strict on every leaf. When a later phase
introduces a **legitimate** divergence — one already recorded as a `deviate`
row in [`docs/parity.md`](../../docs/parity.md) Part A, or accepted at the
Phase-3 decision gate — it is registered here instead of editing the master.

The register never weakens the mockup against itself: entries carry
`appliesTo: "package"`, so mockup re-verification stays byte-strict.

## File shape

```json
{
  "$format": 1,
  "deviations": [ <DeviationEntry>, ... ]
}
```

## DeviationEntry

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id (`DEV-1`, `DEV-2`, …). Cited by PRs and docs. |
| `appliesTo` | `"package"` | yes | Which adapter may claim the entry. Only `"package"` exists; the mockup baseline is never excused. |
| `reason` | string | yes | Why the divergence is legitimate. Must cite the parity.md Part A row (e.g. “A.3 solid slabs vs length-encoded bars, Q7”) or the gate decision. |
| `scenario` | string | no | Restrict to one scenario name (e.g. `"zoom-mid"`). Omit = all scenarios. |
| `step` | string | no | Restrict to frames captured after one step echo (e.g. `"zoom px=6000"`). Omit = all frames. |
| `path` | string | yes | Dotted path to the diverging leaf inside the master JSON, relative to the master object. `*` matches any single segment. Examples: `census.blocks.42.height`, `frames.*.thumb.height`, `frames.7.panY`. |
| `action` | object | yes | How to compare: see below. |

## Actions

| Action | Effect |
|---|---|
| `{"type": "skip"}` | The leaf is not compared at all. |
| `{"type": "tolerance", "value": 1.5}` | Numeric leaves pass when `|expected − actual| ≤ value`. |
| `{"type": "round", "decimals": 1}` | Numeric leaves are rounded to N decimals before comparing (for float-noise regimes). |

First matching entry wins. An entry that matches but still fails (tolerance
exceeded) is reported with its `deviation` id — tolerated drift cannot hide
unbounded drift.

## Example entry

```json
{
  "id": "DEV-1",
  "appliesTo": "package",
  "reason": "Q6/Q7: engine thumb floor is 2px vs mockup 8px and tier-2 rows are length-encoded, not solid slabs — gate-accepted deviation, parity.md A.2/A.3.",
  "scenario": "zoom-mid",
  "path": "frames.*.thumb.height",
  "action": { "type": "tolerance", "value": 6.0 }
}
```

## What is *not* a deviation

Byte-stability of the oracle itself (two consecutive verify runs of the same
adapter producing different bytes) is a determinism bug, never a deviation.
Register entries exist to describe reviewed engine behavior, not flakiness.
