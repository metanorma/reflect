/**
 * Generate coverage.md from coverage.json — the short human report of the
 * INV → scenario/assert mapping. Run from anywhere:
 *
 *   node pkg/prosemirror-minimap/e2e/parity/lib/gen-coverage-report.mjs
 *
 * coverage.parity.ts asserts the committed report matches regeneration,
 * so the two cannot drift silently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARITY = path.resolve(HERE, '..');
const src = JSON.parse(fs.readFileSync(path.join(PARITY, 'coverage.json'), 'utf8'));

const byStatus = new Map();
for (const inv of src.invariants) {
  const key = inv.coverage.status.replace(/ \(partial.*\)/, ' (partial)');
  byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
}
const deferred = src.invariants.filter((i) => i.coverage.status === 'deferred-unit');
const standing = src.invariants.filter((i) => i.coverage.status !== 'deferred-unit');
const gmPort = src.invariants.filter((i) => i.portVerification === 'golden-master');
const pendingGate = src.invariants.filter((i) => i.pendingGate);

const lines = [];
lines.push('# INV coverage report (generated)');
lines.push('');
lines.push('Generated from `coverage.json` by `lib/gen-coverage-report.mjs` — do not');
lines.push('edit by hand. Source of truth for the invariant list: `pkg/prosemirror-minimap/docs/parity.md`');
lines.push('Part B (Phase-1 handoff).');
lines.push('');
lines.push(`- **${standing.length} of ${src.invariants.length}** live invariants carry standing asserts in this`);
lines.push('  suite (run on every execution, record and verify alike).');
lines.push(`- **${deferred.length}** are deferred to the port's unit suite: ${deferred.map((i) => i.id).join(', ')}.`);
lines.push(`- **${gmPort.length}** re-verify against the package adapter through this suite's masters`);
lines.push(`  (${gmPort.map((i) => i.id).join(', ')}) — parity.md Part B \`golden-master\` tags — crossing`);
lines.push('  `fixtures/substitution.json` (README "Fixture bridge").');
if (pendingGate.length) {
  lines.push(`- **${pendingGate.length}** carry a pending-gate marker on port-side semantics:`);
  for (const i of pendingGate) {
    lines.push(`  - ${i.id} — ${i.pendingGate}`);
  }
}
lines.push('');
lines.push('| INV | Parity method | Mockup-side coverage | Scenarios | Port verification |');
lines.push('|---|---|---|---|---|');
for (const inv of src.invariants) {
  const scenarios = (inv.coverage.scenarios ?? []).join(', ') || '—';
  const gate = inv.pendingGate ? ` — pending gate: ${inv.pendingGate}` : '';
  const status = inv.coverage.status
    + (inv.coverage.status === 'deferred-unit' && inv.coverage.rationale ? ' — ' + firstSentence(inv.coverage.rationale) : '');
  lines.push(`| ${inv.id} | ${inv.parityMethod}${gate} | ${status} | ${scenarios} | ${inv.portVerification} |`);
}
lines.push('');

function firstSentence(text) {
  const m = text.match(/^([^.]+\.)/);
  return (m ? m[1] : text).replace(/\|/g, '\\|').trim();
}

fs.writeFileSync(path.join(PARITY, 'coverage.md'), lines.join('\n') + '\n');
console.log(`coverage.md regenerated: ${standing.length} standing, ${deferred.length} deferred, ${gmPort.length} golden-master port-side`);
