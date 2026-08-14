/**
 * Mark specifications — the `marks` map passed to `new Schema` (§9).
 *
 * Order follows the group order in §3.2; the authoritative name list is
 * `MARK_NAMES` in `index.ts`. Formatting marks (§9.1) keep the default
 * `inclusive: true`; reference / semantic marks (§9.2) set
 * `inclusive: false` (§7).
 */

import type { MarkSpec } from 'prosemirror-model';

import { DATA_ATTR } from './attrs.js';
import { CLASS } from './classes.js';


// ---------------------------------------------------------------------------
// 1. Formatting marks (§9.1)
// ---------------------------------------------------------------------------

const formattingMarks: Record<string, MarkSpec> = {
  emphasis: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['em', 0],
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
  },
  strong: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['strong', 0],
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
  },
  subscript: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['sub', 0],
    parseDOM: [{ tag: 'sub' }],
  },
  superscript: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['sup', 0],
    parseDOM: [{ tag: 'sup' }],
  },
  code: {
    // §7: non-exclusive; may co-exist with other marks.
    attrs: { ...DATA_ATTR },
    toDOM: () => ['code', 0],
    parseDOM: [{ tag: 'code' }],
  },
  underline: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['u', 0],
    parseDOM: [{ tag: 'u' }],
  },
  strike: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['s', 0],
    parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
  },
  smallcap: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ['span', { class: CLASS.smallcap }, 0],
    parseDOM: [
      { tag: `span.${CLASS.smallcap}` },
      { style: 'font-variant=small-caps' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. Reference / semantic marks (§9.2) — inclusive: false (§7)
// ---------------------------------------------------------------------------

/** Pull a string-valued mark attribute, tolerating `null`. */
function markAttr(
  mark: { attrs: Record<string, unknown> },
  key: string,
): string | null {
  const v = mark.attrs[key];
  return typeof v === 'string' ? v : null;
}

const referenceMarks: Record<string, MarkSpec> = {
  link: {
    inclusive: false,
    attrs: { href: { default: null }, target: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = {};
      const href = markAttr(mark, 'href');
      const target = markAttr(mark, 'target');
      if (href !== null) {
        attrs['href'] = href;
      }
      if (target !== null) {
        attrs['target'] = target;
      }
      return ['a', attrs, 0];
    },
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (el) => ({
          href: el.getAttribute('href'),
          target: el.getAttribute('target'),
        }),
      },
    ],
  },
  xref: {
    inclusive: false,
    attrs: { target: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: CLASS.xref };
      const target = markAttr(mark, 'target');
      if (target !== null) {
        attrs['data-target'] = target;
      }
      return ['a', attrs, 0];
    },
    parseDOM: [
      {
        tag: `a.${CLASS.xref}`,
        getAttrs: (el) => ({ target: el.getAttribute('data-target') }),
      },
    ],
  },
  eref: {
    inclusive: false,
    attrs: { cite: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: CLASS.eref };
      const cite = markAttr(mark, 'cite');
      if (cite !== null) {
        attrs['data-cite'] = cite;
      }
      return ['cite', attrs, 0];
    },
    parseDOM: [
      {
        tag: `cite.${CLASS.eref}`,
        getAttrs: (el) => ({ cite: el.getAttribute('data-cite') }),
      },
    ],
  },
  concept: {
    inclusive: false,
    attrs: {
      ref: { default: null }, kind: { default: 'xref' },
      ...DATA_ATTR,
    },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: CLASS.concept };
      const ref = markAttr(mark, 'ref');
      if (ref !== null) {
        attrs['data-ref'] = ref;
      }
      const kind = markAttr(mark, 'kind');
      if (kind !== null) {
        attrs['data-kind'] = kind;
      }
      return ['span', attrs, 0];
    },
    parseDOM: [
      {
        tag: `span.${CLASS.concept}`,
        getAttrs: (el) => ({
          ref: el.getAttribute('data-ref'),
          kind: el.getAttribute('data-kind') ?? 'xref',
        }),
      },
    ],
  },
  bcp14: {
    inclusive: false,
    attrs: { type: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: CLASS.bcp14 };
      const type = markAttr(mark, 'type');
      if (type !== null) {
        attrs['data-type'] = type;
      }
      return ['span', attrs, 0];
    },
    parseDOM: [
      {
        tag: `span.${CLASS.bcp14}`,
        getAttrs: (el) => ({ type: el.getAttribute('data-type') }),
      },
    ],
  },
  span: {
    inclusive: false,
    attrs: { class: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = {};
      const cls = markAttr(mark, 'class');
      if (cls !== null) {
        attrs['class'] = cls;
      }
      return ['span', attrs, 0];
    },
    // §9.2: low priority so span.mn-smallcap / span.mn-concept /
    // span.mn-bcp14 win during HTML ingestion.
    parseDOM: [
      {
        tag: 'span[data-class]',
        getAttrs: (el) => ({ class: el.getAttribute('data-class') }),
        priority: 1,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Assembled map (§10)
// ---------------------------------------------------------------------------

/**
 * The mark specs, in §3.2 order.
 *
 * Exposed for consumers that compose a modified schema.
 */
export const metanormaMarks: Record<string, MarkSpec> = {
  ...formattingMarks,
  ...referenceMarks,
};
