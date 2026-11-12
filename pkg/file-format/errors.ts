/**
 * Error taxonomy (FileFormat.spec.md §8). Consumers surface the messages;
 * class names and message shapes are pinned by the suite (§10).
 */
import { CURRENT_ENVELOPE_VERSION, CURRENT_TREE_VERSION } from './versions.js';

/** The parsed value is neither an envelope nor a legacy bare tree (§8). */
export class NotADocument extends Error {
  constructor(detail: string) {
    super(`Not a Metanorma document: ${detail}`);
    this.name = 'NotADocument';
  }
}

/** The `format` member is present but malformed; never a legacy fallback (§8). */
export class MalformedEnvelope extends Error {
  constructor(detail: string) {
    super(`Malformed envelope: ${detail}`);
    this.name = 'MalformedEnvelope';
  }
}

/** The file's `format.envelope` is newer than this reader (§8). */
export class FutureEnvelope extends Error {
  constructor(fileVersion: number, readerVersion = CURRENT_ENVELOPE_VERSION) {
    super(
      `File format.envelope ${fileVersion} is newer than this reader's ${readerVersion}`,
    );
    this.name = 'FutureEnvelope';
  }
}

/** The file's `format.tree` is newer than this reader (§8). */
export class FutureTree extends Error {
  constructor(fileVersion: number, readerVersion = CURRENT_TREE_VERSION) {
    super(
      `File format.tree ${fileVersion} is newer than this reader's ${readerVersion}`,
    );
    this.name = 'FutureTree';
  }
}

/** A migration registry is non-contiguous; fails loud at load (§7, §8). */
export class RegistryGapError extends Error {
  constructor(axis: 'envelope' | 'tree', missingFrom: number) {
    super(
      `Migration registry gap: no ${axis} step for transition ${missingFrom} → ${missingFrom + 1}`,
    );
    this.name = 'RegistryGapError';
  }
}
