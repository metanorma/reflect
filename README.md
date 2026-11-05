This is currently in pre-production stage.

[Live demo](https://metanorma.github.io/reflect/).

Refer to [docs](./docs/README.md). For how to contribute — code conventions
and the verification commands for every change type — see
[CONTRIBUTING.rst](./CONTRIBUTING.rst).

### Upstream drift detection

The Metanorma reference ledger ([docs/metanorma-model.md](./docs/metanorma-model.md)
§1) pins the upstream commits its facts were verified against. A scheduled
job ([drift-check.yml](./.github/workflows/drift-check.yml), daily) diffs
each pinned repo's watched paths at the pin vs its default branch —
`scripts/check-pins.mjs`, zero dependencies; the pin itself is the baseline,
nothing is stored. Watching is **cite-driven and tiered**: paths the ledger
cites as verification sources are fail-tier (drift fails the job); their
enclosing subtrees are report-tier (restructures surface as a digest, no
action required).

**Accepted cadence.** metanorma-standoc's cited files are hot upstream, so
between its releases the job is *expected* red with a drift issue open. Red
means "the ledger is stale relative to upstream" — information, not an error
state. The issue is the standing work item; for verified no-semantic-change
drift the fast path is the designed exit: re-pin + bump the ledger's
Re-verified date + a one-line comment, in one commit.

**Channels.** Fail-tier drift opens/updates a `drift`-labelled issue per
repo (rewritten only when the diff actually changed — no per-run churn).
Report-tier movement lands in a single long-lived "Upstream watch" digest
issue, commented only when a repo's report-tier signature changes; watch it
if you want the digests. Error-class failures (API, rate limit, stale
ledger cite) turn the job red without touching any issue.

**Division of labor.** The machine detects textual divergence; humans
interpret it. The machine never edits the ledger, and a pin bump always
travels with its interpretation — the full checklist (triage → interpret →
rewrite → re-pin) is embedded in every drift issue. Offline checks run in
CI on every PR: `yarn check-pins` (pin-table lint) and `yarn test:scripts`.

**Caveat.** GitHub disables scheduled workflows after 60 days of repository
inactivity — on a quiet pre-production repo this watch can silently stop.
Revive it with a manual dispatch of the workflow.

### Roadmap

- Full Metanorma document model coverage
  (anchoring to Standoc model / Semantic XML).

- **Claim-named probes** over the drift-check substrate: ledger claims
  re-expressed as content predicates ("the engine is leptris, not jing"),
  so an alert names the falsified claim instead of "bytes differ" — plus a
  release-feed trigger for metanorma-standoc. A later layer over the
  shipped pin-diff check, not a replacement.
