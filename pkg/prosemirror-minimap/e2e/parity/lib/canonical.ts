/**
 * Canonical JSON serialization — the byte-stability contract.
 *
 * Masters are stored as `canonical(value) + '\n'`. Object key order is the
 * literal construction order of the captured structures (deterministic: the
 * capture code always builds objects the same way), arrays keep their
 * capture order, floats are pre-rounded at capture time (3 decimals for
 * geometry, 4 for wear opacities) so serialization is stable.
 *
 * No timestamps, no environment-volatile values: two consecutive runs must
 * produce byte-identical output — that is the determinism proof.
 */

export function canonical(value: unknown): string {
  return JSON.stringify(value);
}

export function canonicalFile(value: unknown): string {
  return canonical(value) + '\n';
}

/** Stable-enough content hash (sha256, hex) for reporting equality across
 *  runs without printing full masters into logs. */
export async function sha256(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex');
}
