## Summary

<!-- Brief description of the change -->

## Checklist

- [ ] If this changes a spec (`docs/**/*.md`), I have run `yarn spec-impact docs/<changed-spec>.md` and reviewed the listed dependents.
- [ ] Spec cross-references are relative markdown links (no version numbers in headers). See [CONVENTIONS.md](docs/CONVENTIONS.md).
- [ ] Commit messages for spec changes follow `docs(<area>): <summary>` (e.g. `docs(schema): add bibdata node`).
- [ ] `yarn check-specs` passes (enforced in CI).
