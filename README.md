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
action required). The pin table covers the seven grammar/pipeline sources —
standoc-models, basicdoc-models, the Relaton and requirements grammar
repos, metanorma-standoc, the metanorma driver, isodoc — and **submodule
pointers are watched too**: a models-side grammar refresh surfaces at the
source, not only later at vendoring. Every report foots a coverage note
listing facts cited to *unpinned* sources (currently metanorma-utils,
plurimath) — green means "nothing watched moved", never "the ledger is
current".

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
  (anchoring to Standoc / Semantic XML).

- Rewrite toolbar functionality.

- Switch to panel-based layout (use `panel-layout` in `editor-gui`).

- Revamp toolbar UX: toolbar as a panel and/or floating toolbars.

- File format versioning (both schema- and container-wise),
  or using Metanorma XML (that comes with versioning) as internal format
  (and then only versioning the container, if any).

- Using OPFS, rather than data URIs, for handling embedded media
  at editor runtime.

- (tentative) SQLite single file format.

- Integrity/provenance checks for saved documents to catch accidental corruption
  (truncated writes, buggy migrations) as well as tampering.

- Editor versioning.
