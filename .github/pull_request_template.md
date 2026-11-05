## Summary

<!-- Brief description of the change -->

## Checklist

- [ ] If this changes a spec (`docs/**/*.md`), I have run
      `yarn spec-impact docs/<changed-spec>.md` and reviewed the listed
      dependents.
- [ ] If this adds or extends a **model area** in a spec, the same PR
      adds/extends the upstream ledger row + watch-map entry
      (`docs/metanorma-model.md` §1, `scripts/check-pins.mjs`) — the
      drift oracle only watches what the ledger pins.
- [ ] Spec cross-references are relative markdown links (no version
      numbers in headers). See [CONVENTIONS.md](docs/CONVENTIONS.md).
- [ ] If this is a significant spec transition (multi-commit,
      cross-spec), I have added an entry to
      [CHANGELOG.md](docs/CHANGELOG.md).
- [ ] Commit messages for spec changes follow `docs(<area>): <summary>`
      (e.g. `docs(schema): add bibdata node`).
- [ ] `yarn check-specs` passes (enforced in CI).
- [ ] `yarn test` passes (all workspace suites).
- [ ] Affected workspaces compile:
      `yarn workspace <name> compile` (workspace names in
      [CONTRIBUTING.rst](CONTRIBUTING.rst), Verification).
- [ ] If `yarn.lock` changed: `yarn dedupe --check` passes locally
      (enforced in CI).

---

Conventions & verification: spec changes are governed by
[CONVENTIONS.md](docs/CONVENTIONS.md); code changes by
[CONTRIBUTING.rst](CONTRIBUTING.rst) — its *Verification* section lists
the command to run for each change type (`yarn test`, per-workspace
`compile`, e2e).
