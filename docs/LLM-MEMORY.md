# LLM agent working memory — discipline

*When using an LLM with a harness with memory feature.* This doc states what
that memory is for, what belongs in it, and how to read it. It is guidance
for the agent workflow, not a spec: it sits outside the source-of-truth
hierarchy of [`CONVENTIONS.md`](./CONVENTIONS.md) §1 and is non-contractual.

## 1. What to record: invariants only

Record what stays true until someone deliberately changes it:

- library behavior verified against the *installed* version
  (not upstream docs, examples, or recall);
- engine and environment traps (Node, Yarn, esbuild, React, Playwright
  behaviors that cost real time to rediscover);
- major user decisions and corrections that do not fit documentation,
  with the reasoning that decided them;
- non-obvious command recipes — the working invocation, not the attempts
  that failed on the way to it.

## 2. What never to record

- Mutable state: code shape at a moment in time, test counts,
  file:line pins, in-flight or outstanding bug status. Those belong to the
  specs, the [`CHANGELOG.md`](./CHANGELOG.md), and `git log`. An entry that
  duplicates a spec fact rots while the spec stays correct, and a stale entry
  is worse than none because it carries the authority of a recorded fact.
- Conventions that are not yet mechanical enough for a script to enforce:
  document them instead.
- Design contracts: document instead.
- The fact that something was implemented (VCS history, changelog cover that).

## 3. Reading discipline: memory suggests, the code decides

Treat any memory claim about current code as a lead, not a fact: verify it
with one read or grep before acting on it. When memory and the code
disagree, the code wins, and the entry is corrected in the same session
that discovered the disagreement.
