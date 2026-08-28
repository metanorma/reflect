/**
 * Synthetic schema for the browser harness (§15.3).
 *
 * A browser-side re-declaration of the headless `test.mjs` schema
 * (§15.1.1) — the package is schema-agnostic, so the harness exercises
 * it on a plain prosemirror-model schema, NOT the Metanorma one. Keep the
 * node set in sync with `test.mjs`'s synthetic schema.
 */
import { Schema } from 'prosemirror-model';

export const harnessSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
      parseDOM: [
        { tag: 'h1', getAttrs: () => ({ level: 1 }) },
        { tag: 'h2', getAttrs: () => ({ level: 2 }) },
        { tag: 'h3', getAttrs: () => ({ level: 3 }) },
      ],
    },
    image: {
      group: 'block',
      inline: false,
      attrs: {
        src: { default: '' },
        width: { default: null },
        height: { default: null },
        id: { default: null },
      },
      toDOM: () => ['img', {}],
    },
    section: { group: 'block', content: 'block+', toDOM: () => ['section', 0] },
    quote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
      parseDOM: [{ tag: 'blockquote' }],
    },
    code_block: {
      group: 'block',
      content: 'text*',
      code: true,
      toDOM: () => ['pre', 0],
      parseDOM: [{ tag: 'pre' }],
    },
    text: { group: 'inline' },
    hardBreak: {
      inline: true,
      group: 'inline',
      selectable: false,
      toDOM: () => ['br'],
    },
  },
});

/**
 * Build a doc node from harness JSON. The schema's `nodeFromJSON` handles
 * attrs/defaults; unknown attr keys are silently dropped by prosemirror-model,
 * so test fixtures stay lean (`{ type: 'paragraph' }` is enough).
 */
export function docFromJson(json: unknown): import('prosemirror-model').Node {
  return harnessSchema.nodeFromJSON(json);
}
