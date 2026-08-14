/**
 * Node specifications — the 46-node `nodes` map passed to `new Schema` (§8).
 *
 * Order follows the group order in §3.1. `text` is declared explicitly with
 * `group: "inline"` so that `inline*` content expressions resolve.
 */

import type {
  Node, NodeSpec, TagParseRule, DOMOutputSpec,
} from 'prosemirror-model';

import {
  BLOCK_GROUP, INLINE_GROUP,
  SECTION_FRONT_GROUP, SECTION_BODY_GROUP, SECTION_ANNEX_GROUP, SECTION_BACK_GROUP,
} from './groups.js';
import { baseAttrs, sectionAttrs, DATA_ATTR } from './attrs.js';
import { CLASS } from './classes.js';

// ---------------------------------------------------------------------------
// toDOM helpers
// ---------------------------------------------------------------------------

/**
 * Build a `<section class=cls data-id data-number>` toDOM spec for a section
 * node (§8.2). The section's content (including the optional `section_title`
 * child) is rendered via the content hole `0`. `null` attributes are kept out
 * of the object so that `exactOptionalPropertyTypes` is satisfied; ProseMirror
 * drops `null`/`undefined` attribute values during rendering anyway.
 */
function sectionToDOM(cls: string): (node: Node) => DOMOutputSpec {
  return (node) => {
    const attrs: Record<string, string> = { class: cls };
    const id = node.attrs['id'] as string | null;
    const number = node.attrs['number'] as string | null;
    if (id !== null) {
      attrs['data-id'] = id;
    }
    if (number !== null) {
      attrs['data-number'] = number;
    }
    return ['section', attrs, 0];
  };
}

/** parseDOM getter for the {@link sectionToDOM} shape. */
function sectionParseRule(cls: string): readonly TagParseRule[] {
  return [
    {
      tag: `section.${cls}`,
      getAttrs: (el) => ({
        id: el.getAttribute('data-id'),
        number: el.getAttribute('data-number'),
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// 1. Structural nodes (§8.1)
// ---------------------------------------------------------------------------

const structuralNodes: Record<string, NodeSpec> = {
    doc: {
      // Isodoc: annexes are doc-level siblings after `sections`, before
      // `bibliography` (zero or more).
      content: '(bibdata preface? sections? annex* bibliography? footnotes?)',
      attrs: { ...DATA_ATTR },
      toDOM: () => ['div', { class: CLASS.doc }, 0],
    },
    bibdata: {
      content: '',
      atom: true,
      attrs: { item: { default: null }, ...DATA_ATTR },
      toDOM: () => ['div', { class: CLASS.bibdata }],
      // No parseDOM: doc-level node created by the default doc / loader, not
      // by HTML ingestion.
    },
    preface: {
      content: 'section_front+',
      attrs: baseAttrs(),
      toDOM: () => ['section', { class: CLASS.preface }, 0],
      parseDOM: [{ tag: `section.${CLASS.preface}` }],
      allowGapCursor: true,
    },
    sections: {
      content: 'section_body+',
      attrs: baseAttrs(),
      toDOM: () => ['section', { class: CLASS.sections }, 0],
      parseDOM: [{ tag: `section.${CLASS.sections}` }],
      allowGapCursor: true,
    },
    bibliography: {
      content: 'references+',
      attrs: baseAttrs(),
      toDOM: () => ['section', { class: CLASS.bibliography }, 0],
      parseDOM: [{ tag: `section.${CLASS.bibliography}` }],
      allowGapCursor: true,
    },
};

// ---------------------------------------------------------------------------
// 2. Section nodes (§8.2) — cohort groups: section_front / section_body / section_back
// ---------------------------------------------------------------------------

/**
 * The `section_title` child node — a textblock whose inline content is the
 * section heading. Permitted as an optional first child of every section node
 * (§8.2). Has no group membership so it cannot be inserted as a general block;
 * it is created only by the clause-insertion commands (sections.ts).
 *
 * Mirrors Metanorma's `<title>` child element (TextElement content, §17).
 */
const sectionTitleNode: Record<string, NodeSpec> = {
  section_title: {
    content: `${INLINE_GROUP}*`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['div', { class: CLASS.sectionTitle }, 0],
    parseDOM: [{ tag: `div.${CLASS.sectionTitle}` }],
  },
};

const sectionNodes: Record<string, NodeSpec> = {
    // Isodoc Clause-Section: STRICT XOR — blocks (leaf) or subclauses, never
    // both (no hanging paragraphs in the numbered body hierarchy).
    clause: {
      content: `section_title? (${BLOCK_GROUP}+ | (clause | terms | definitions | floating_title)+)`,
      group: SECTION_BODY_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.clause),
      parseDOM: sectionParseRule(CLASS.clause),
    },
    // Isodoc Annex-Section-Body: non-strict — prefatory blocks, then
    // subclauses (no self-nesting; annexes are doc-level siblings).
    annex: {
      content: `section_title? ${BLOCK_GROUP}* (clause | terms | definitions | references | floating_title)*`,
      group: SECTION_ANNEX_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.annex),
      parseDOM: sectionParseRule(CLASS.annex),
    },
    // Isodoc Content-Section (`content`, preface-only): unnumbered generic
    // clause; blocks, then recursive content-subsections.
    content_section: {
      content: `section_title? ${BLOCK_GROUP}* content_section*`,
      group: SECTION_FRONT_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.contentSection),
      parseDOM: sectionParseRule(CLASS.contentSection),
    },
    // Isodoc Content-Section: front-matter sections nest content-subsections.
    abstract: {
      content: `section_title? ${BLOCK_GROUP}* content_section*`,
      group: SECTION_FRONT_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.abstract),
      parseDOM: sectionParseRule(CLASS.abstract),
    },
    foreword: {
      content: `section_title? ${BLOCK_GROUP}* content_section*`,
      group: SECTION_FRONT_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.foreword),
      parseDOM: sectionParseRule(CLASS.foreword),
    },
    introduction: {
      content: `section_title? ${BLOCK_GROUP}* content_section*`,
      group: SECTION_FRONT_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.introduction),
      parseDOM: sectionParseRule(CLASS.introduction),
    },
    acknowledgements: {
      content: `section_title? ${BLOCK_GROUP}* content_section*`,
      group: SECTION_FRONT_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.acknowledgements),
      parseDOM: sectionParseRule(CLASS.acknowledgements),
    },
    // Isodoc terms: prefatory blocks, then nested terms/definitions
    // (term-entry subtree out of scope).
    terms: {
      content: `section_title? ${BLOCK_GROUP}* (terms | definitions)*`,
      group: SECTION_BODY_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.terms),
      parseDOM: sectionParseRule(CLASS.terms),
    },
    // Isodoc definitions: (BasicBlock | dl | definitions)+ — at least one
    // child; dl is in the block group.
    definitions: {
      content: `section_title? (${BLOCK_GROUP} | definitions)+`,
      group: SECTION_BODY_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.definitions),
      parseDOM: sectionParseRule(CLASS.definitions),
    },
    // Isodoc references: ordered — prefatory blocks, then entries, then
    // nested references.
    references: {
      content: `section_title? ${BLOCK_GROUP}* bibitem* references*`,
      group: SECTION_BACK_GROUP,
      attrs: sectionAttrs(),
      createGapCursor: true,
      toDOM: sectionToDOM(CLASS.references),
      parseDOM: sectionParseRule(CLASS.references),
    },
};

// ---------------------------------------------------------------------------
// 2b. Bibliographic entry nodes (§8.2) — no group (only inside `references`)
// ---------------------------------------------------------------------------

/**
 * The `bibitem` node — a single bibliography entry. An atom node storing a
 * `BibliographicItem` (from `@metanorma/relaton`) as a single JSON `item`
 * attr, rendered as a compact summary by a NodeView. Has no group membership:
 * it is insertable only inside `references` sections via a dedicated command.
 *
 * Mirrors Metanorma Presentation XML's `<bibitem>` element.
 */
const bibItemNodes: Record<string, NodeSpec> = {
  bibitem: {
    content: '',
    atom: true,
    attrs: { item: { default: null }, ...DATA_ATTR },
    toDOM: () => ['div', { class: CLASS.bibitem }],
    parseDOM: [{ tag: `div.${CLASS.bibitem}` }],
  },
};

// ---------------------------------------------------------------------------
// 3. Block nodes (§8.3)
// ---------------------------------------------------------------------------

const blockNodes: Record<string, NodeSpec> = {
  paragraph: {
    content: `${INLINE_GROUP}*`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['p', 0],
    parseDOM: [{ tag: 'p' }],
  },
    note: {
      content: `${BLOCK_GROUP}+`,
      group: BLOCK_GROUP,
      attrs: { ...DATA_ATTR },
      toDOM: () => ['div', { class: CLASS.note }, 0],
      parseDOM: [{ tag: `div.${CLASS.note}` }],
    },
    admonition: {
      content: `${BLOCK_GROUP}+`,
      group: BLOCK_GROUP,
      attrs: { type: { default: null }, ...DATA_ATTR },
      toDOM: (node) => {
        const type = node.attrs['type'] as string | null;
        const attrs: Record<string, string> = {
          class: `${CLASS.admonition} ${type ?? ''}`.trim(),
        };
        if (type !== null) {
          attrs['data-type'] = type;
        }
        return ['div', attrs, 0];
      },
      parseDOM: [
        {
          tag: `div.${CLASS.admonition}`,
          getAttrs: (el) => ({ type: el.getAttribute('data-type') }),
        },
      ],
    },
    example: {
      content: `${BLOCK_GROUP}+`,
      group: BLOCK_GROUP,
      attrs: { ...DATA_ATTR },
      toDOM: () => ['div', { class: CLASS.example }, 0],
      parseDOM: [{ tag: `div.${CLASS.example}` }],
    },
  sourcecode: {
    content: 'text*',
    group: BLOCK_GROUP,
    code: true,
    attrs: { text: { default: null }, language: { default: null }, ...DATA_ATTR },
    toDOM: (node) => {
      const language = node.attrs['language'] as string | null;
      return [
        'pre',
        { class: language !== null ? `language-${language}` : '' },
        ['code', 0],
      ];
    },
    parseDOM: [
      {
        tag: 'pre',
        getAttrs: (el) => {
          const m = /language-(\S+)/.exec(el.className);
          return { language: m !== null ? (m[1] ?? null) : null };
        },
      },
    ],
  },
    formula: {
      content: '',
      group: BLOCK_GROUP,
      atom: true,
      attrs: {
        id: { default: null },
        number: { default: null },
        type: { default: 'asciimath' },
        asciimath: { default: null },
        mathml: { default: null },
        ...DATA_ATTR,
      },
      toDOM: (node) => {
        const type = node.attrs['type'] as string;
        const attrs: Record<string, string> = {
          class: CLASS.formula, 'data-type': type,
        };
        const asciimath = node.attrs['asciimath'] as string | null;
        const mathml = node.attrs['mathml'] as string | null;
        const number = node.attrs['number'] as string | null;
        if (asciimath !== null) {
          attrs['data-asciimath'] = asciimath;
        }
        if (mathml !== null) {
          attrs['data-mathml'] = mathml;
        }
        if (number !== null) {
          attrs['data-number'] = number;
        }
        return ['div', attrs];
      },
      parseDOM: [
        {
          tag: `div.${CLASS.formula}`,
          getAttrs: (el) => ({
            type: el.getAttribute('data-type') ?? 'asciimath',
            asciimath: el.getAttribute('data-asciimath'),
            mathml: el.getAttribute('data-mathml'),
            number: el.getAttribute('data-number'),
          }),
        },
      ],
    },
  quote: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['blockquote', 0],
    parseDOM: [{ tag: 'blockquote' }],
  },
  review: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['div', { class: CLASS.review }, 0],
    parseDOM: [{ tag: `div.${CLASS.review}` }],
  },
  floating_title: {
    content: `${INLINE_GROUP}*`,
    group: BLOCK_GROUP,
    attrs: { id: { default: null }, depth: { default: 1 }, ...DATA_ATTR },
    toDOM: (node) => {
      const attrs: Record<string, string> = { class: CLASS.floatingTitle };
      const id = node.attrs['id'] as string | null;
      if (id !== null) {
        attrs['data-id'] = id;
      }
      attrs['data-depth'] = String(node.attrs['depth']);
      return ['div', attrs, 0];
    },
    parseDOM: [
      {
        tag: `.${CLASS.floatingTitle}`,
        getAttrs: (el) => ({
          id: el.getAttribute('data-id'),
          depth: Number(el.getAttribute('data-depth') ?? '1'),
        }),
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 4. List nodes (§8.4)
// ---------------------------------------------------------------------------

const listNodes: Record<string, NodeSpec> = {
  bullet_list: {
    content: 'list_item+',
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['ul', 0],
    parseDOM: [{ tag: 'ul' }],
  },
  ordered_list: {
    content: 'list_item+',
    group: BLOCK_GROUP,
    attrs: { order: { default: 1 }, ...DATA_ATTR },
    toDOM: (node) => {
      const order = node.attrs['order'] as number;
      const attrs: Record<string, number> = {};
      if (order > 1) {
        attrs['start'] = order;
      }
      return ['ol', attrs, 0];
    },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (el) => ({
          order: el.hasAttribute('start') ? Number(el.getAttribute('start')) : 1,
        }),
      },
    ],
  },
  list_item: {
    content: `${BLOCK_GROUP}+`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['li', 0],
    parseDOM: [{ tag: 'li' }],
  },
  dl: {
    content: '(dt dd)+',
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['dl', 0],
    parseDOM: [{ tag: 'dl' }],
  },
  dt: {
    content: `${INLINE_GROUP}*`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['dt', 0],
    parseDOM: [{ tag: 'dt' }],
  },
  dd: {
    content: `${BLOCK_GROUP}+`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ['dd', 0],
    parseDOM: [{ tag: 'dd' }],
  },
};

// ---------------------------------------------------------------------------
// 5. Table nodes (§8.5)
// ---------------------------------------------------------------------------

const tableNodes: Record<string, NodeSpec> = {
  table: {
    content: '(table_head | table_body | table_foot)+',
    group: BLOCK_GROUP,
    attrs: {
      id: { default: null }, number: { default: null },
      title: { default: null }, ...DATA_ATTR,
    },
    toDOM: () => ['table', 0],
    parseDOM: [{ tag: 'table' }],
  },
  table_head: {
    content: 'table_row+',
    attrs: { ...DATA_ATTR },
    toDOM: () => ['thead', 0],
    parseDOM: [{ tag: 'thead' }],
  },
  table_body: {
    content: 'table_row+',
    attrs: { ...DATA_ATTR },
    toDOM: () => ['tbody', 0],
    parseDOM: [{ tag: 'tbody' }],
  },
  table_foot: {
    content: 'table_row+',
    attrs: { ...DATA_ATTR },
    toDOM: () => ['tfoot', 0],
    parseDOM: [{ tag: 'tfoot' }],
  },
  table_row: {
    content: 'table_cell+',
    attrs: { ...DATA_ATTR },
    toDOM: () => ['tr', 0],
    parseDOM: [{ tag: 'tr' }],
  },
  table_cell: {
    content: `${BLOCK_GROUP}+`,
    attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, ...DATA_ATTR },
    toDOM: (node) => {
      const colspan = node.attrs['colspan'] as number;
      const rowspan = node.attrs['rowspan'] as number;
      return ['td', { colspan, rowspan }, 0];
    },
    parseDOM: [{ tag: 'td' }, { tag: 'th' }],
  },
};

// ---------------------------------------------------------------------------
// 6. Media nodes (§8.6)
// ---------------------------------------------------------------------------

const mediaNodes: Record<string, NodeSpec> = {
    figure: {
      content: `(image | ${BLOCK_GROUP})*`,
      group: BLOCK_GROUP,
      attrs: {
        id: { default: null },
        number: { default: null },
        title: { default: null },
        ...DATA_ATTR,
      },
      toDOM: (node) => {
        const attrs: Record<string, string> = { class: CLASS.figure };
        const id = node.attrs['id'] as string | null;
        if (id !== null) {
          attrs['data-id'] = id;
        }
        return ['figure', attrs, 0];
      },
      parseDOM: [{ tag: 'figure' }],
    },
  image: {
    content: '',
    atom: true,
    draggable: true,
    attrs: { src: { default: '' }, alt: { default: null }, ...DATA_ATTR },
    toDOM: (node) => {
      const src = node.attrs['src'] as string;
      const alt = node.attrs['alt'] as string | null;
      const attrs: Record<string, string> = { src, 'data-src': src };
      if (alt !== null) {
        attrs['alt'] = alt;
      }
      return ['img', attrs];
    },
    parseDOM: [
      {
        tag: 'img',
        getAttrs: (el) => ({
          src: el.getAttribute('src'),
          alt: el.getAttribute('alt'),
        }),
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 7. Footnote nodes (§8.7)
// ---------------------------------------------------------------------------

const footnoteNodes: Record<string, NodeSpec> = {
    footnotes: {
      content: 'footnote_entry+',
      attrs: { ...DATA_ATTR },
      toDOM: () => ['section', { class: CLASS.footnotes }, 0],
      parseDOM: [
        { tag: `section.${CLASS.footnotes}` },
        { tag: `ol.${CLASS.footnotes}` },
      ],
    },
    footnote_entry: {
      content: `${BLOCK_GROUP}+`,
      attrs: { id: { default: null }, number: { default: null }, ...DATA_ATTR },
      toDOM: (node) => {
        const attrs: Record<string, string> = { class: CLASS.footnoteEntry };
        const id = node.attrs['id'] as string | null;
        const number = node.attrs['number'] as string | null;
        if (id !== null) {
          attrs['data-id'] = id;
        }
        if (number !== null) {
          attrs['data-number'] = number;
        }
        return ['div', attrs, 0];
      },
      parseDOM: [
        {
          tag: `.${CLASS.footnoteEntry}`,
          getAttrs: (el) => ({
            id: el.getAttribute('data-id'),
            number: el.getAttribute('data-number'),
          }),
        },
      ],
    },
      footnote_marker: {
        content: '',
        group: INLINE_GROUP,
        inline: true,
        atom: true,
        attrs: { id: { default: null }, target: { default: null }, ...DATA_ATTR },
        toDOM: (node) => {
          const attrs: Record<string, string> = { class: CLASS.footnoteMarker };
          const target = node.attrs['target'] as string | null;
          if (target !== null) {
            attrs['data-target'] = target;
          }
          return ['sup', attrs];
        },
        parseDOM: [
          {
            tag: `sup.${CLASS.footnoteMarker}`,
            getAttrs: (el) => ({ target: el.getAttribute('data-target') }),
          },
        ],
      },
      stem: {
        content: '',
        group: INLINE_GROUP,
        inline: true,
        atom: true,
        attrs: {
          type: { default: 'asciimath' },
          asciimath: { default: null },
          mathml: { default: null },
          ...DATA_ATTR,
        },
        toDOM: (node) => {
          const type = node.attrs['type'] as string;
          const attrs: Record<string, string> = { class: CLASS.stem, 'data-type': type };
          const asciimath = node.attrs['asciimath'] as string | null;
          const mathml = node.attrs['mathml'] as string | null;
          if (asciimath !== null) {
            attrs['data-asciimath'] = asciimath;
          }
          if (mathml !== null) {
            attrs['data-mathml'] = mathml;
          }
          return ['span', attrs];
        },
        parseDOM: [
          {
            tag: `span.${CLASS.stem}`,
            getAttrs: (el) => ({
              type: el.getAttribute('data-type') ?? 'asciimath',
              asciimath: el.getAttribute('data-asciimath'),
              mathml: el.getAttribute('data-mathml'),
            }),
          },
        ],
      },
    };

// ---------------------------------------------------------------------------
// 8. Leaf inline nodes (§8.8)
// ---------------------------------------------------------------------------

const leafInlineNodes: Record<string, NodeSpec> = {
  text: {
    group: INLINE_GROUP,
  },
    soft_break: {
      content: '',
      group: INLINE_GROUP,
      inline: true,
      atom: true,
      attrs: { ...DATA_ATTR },
      toDOM: () => ['br'],
      parseDOM: [{ tag: 'br' }],
    },
};

// ---------------------------------------------------------------------------
// Assembled map (§10)
// ---------------------------------------------------------------------------

/**
 * The 44 node specs, in §3.1 group order.
 *
 * Exposed for consumers that compose a modified schema.
 */
export const metanormaNodes: Record<string, NodeSpec> = {
  ...structuralNodes,
  ...sectionTitleNode,
  ...sectionNodes,
  ...bibItemNodes,
  ...blockNodes,
  ...listNodes,
  ...tableNodes,
  ...mediaNodes,
  ...footnoteNodes,
  ...leafInlineNodes,
};
