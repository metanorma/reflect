/**
 * Node specifications — the 43-node `nodes` map passed to `new Schema` (§8).
 *
 * Order follows the group order in §3.1. `text` is declared explicitly with
 * `group: "inline"` so that `inline*` content expressions resolve.
 */

import type { Node, NodeSpec, TagParseRule, DOMOutputSpec } from "prosemirror-model";

import { BLOCK_GROUP, INLINE_GROUP, SECTION_GROUP } from "./groups.js";
import { baseAttrs, sectionAttrs, DATA_ATTR } from "./attrs.js";

// ---------------------------------------------------------------------------
// toDOM helpers
// ---------------------------------------------------------------------------

/**
 * Build a `<section class=cls data-id data-number>` toDOM spec for a section
 * node (§8.2). `null` attributes are kept out of the object so that
 * `exactOptionalPropertyTypes` is satisfied; ProseMirror drops `null`/`undefined`
 * attribute values during rendering anyway.
 */
function sectionToDOM(cls: string): (node: Node) => DOMOutputSpec {
  return (node) => {
    const attrs: Record<string, string> = { class: cls };
    const id = node.attrs["id"] as string | null;
    const number = node.attrs["number"] as string | null;
    if (id !== null) {
      attrs["data-id"] = id;
    }
    if (number !== null) {
      attrs["data-number"] = number;
    }
    return ["section", attrs, 0];
  };
}

/** parseDOM getter for the {@link sectionToDOM} shape. */
function sectionParseRule(cls: string): readonly TagParseRule[] {
  return [
    {
      tag: `section.${cls}`,
      getAttrs: (el) => ({
        id: el.getAttribute("data-id"),
        number: el.getAttribute("data-number"),
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// 1. Structural nodes (§8.1)
// ---------------------------------------------------------------------------

const structuralNodes: Record<string, NodeSpec> = {
  doc: {
    content: "(preface? sections? bibliography? footnotes?)",
    attrs: { ...DATA_ATTR },
    toDOM: () => ["div", { class: "mn-doc" }, 0],
  },
  preface: {
    content: `(section | ${BLOCK_GROUP})*`,
    attrs: baseAttrs(),
    toDOM: () => ["section", { class: "mn-preface" }, 0],
    parseDOM: [{ tag: "section.mn-preface" }],
  },
  sections: {
    content: `(section | ${BLOCK_GROUP})*`,
    attrs: baseAttrs(),
    toDOM: () => ["section", { class: "mn-sections" }, 0],
    parseDOM: [{ tag: "section.mn-sections" }],
  },
  bibliography: {
    content: `(section | ${BLOCK_GROUP})*`,
    attrs: baseAttrs(),
    toDOM: () => ["section", { class: "mn-bibliography" }, 0],
    parseDOM: [{ tag: "section.mn-bibliography" }],
  },
};

// ---------------------------------------------------------------------------
// 2. Section nodes (§8.2) — group: "section"
// ---------------------------------------------------------------------------

const sectionNodes: Record<string, NodeSpec> = {
  clause: {
    content: `(clause | ${BLOCK_GROUP})*`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-clause"),
    parseDOM: sectionParseRule("mn-clause"),
  },
  annex: {
    content: `(annex | clause | ${BLOCK_GROUP})*`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-annex"),
    parseDOM: sectionParseRule("mn-annex"),
  },
  content_section: {
    content: `(section | ${BLOCK_GROUP})*`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-content-section"),
    parseDOM: sectionParseRule("mn-content-section"),
  },
  abstract: {
    content: `${BLOCK_GROUP}+`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-abstract"),
    parseDOM: sectionParseRule("mn-abstract"),
  },
  foreword: {
    content: `${BLOCK_GROUP}+`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-foreword"),
    parseDOM: sectionParseRule("mn-foreword"),
  },
  introduction: {
    content: `${BLOCK_GROUP}+`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-introduction"),
    parseDOM: sectionParseRule("mn-introduction"),
  },
  acknowledgements: {
    content: `${BLOCK_GROUP}+`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-acknowledgements"),
    parseDOM: sectionParseRule("mn-acknowledgements"),
  },
  terms: {
    content: `(clause | ${BLOCK_GROUP})*`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-terms"),
    parseDOM: sectionParseRule("mn-terms"),
  },
  definitions: {
    content: `(clause | ${BLOCK_GROUP})*`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-definitions"),
    parseDOM: sectionParseRule("mn-definitions"),
  },
  references: {
    content: `(clause | ${BLOCK_GROUP})*`,
    group: SECTION_GROUP,
    attrs: sectionAttrs(),
    toDOM: sectionToDOM("mn-references"),
    parseDOM: sectionParseRule("mn-references"),
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
    toDOM: () => ["p", 0],
    parseDOM: [{ tag: "p" }],
  },
  note: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["div", { class: "note" }, 0],
    parseDOM: [{ tag: "div.note" }],
  },
  admonition: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { type: { default: null }, ...DATA_ATTR },
    toDOM: (node) => {
      const type = node.attrs["type"] as string | null;
      const attrs: Record<string, string> = { class: `admonition ${type ?? ""}`.trim() };
      if (type !== null) {
        attrs["data-type"] = type;
      }
      return ["div", attrs, 0];
    },
    parseDOM: [
      {
        tag: "div.admonition",
        getAttrs: (el) => ({ type: el.getAttribute("data-type") }),
      },
    ],
  },
  example: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["div", { class: "example" }, 0],
    parseDOM: [{ tag: "div.example" }],
  },
  sourcecode: {
    content: "text*",
    group: BLOCK_GROUP,
    code: true,
    attrs: { text: { default: null }, language: { default: null }, ...DATA_ATTR },
    toDOM: (node) => {
      const language = node.attrs["language"] as string | null;
      return [
        "pre",
        { class: language !== null ? `language-${language}` : "" },
        ["code", 0],
      ];
    },
    parseDOM: [
      {
        tag: "pre",
        getAttrs: (el) => {
          const m = /language-(\S+)/.exec(el.className);
          return { language: m !== null ? (m[1] ?? null) : null };
        },
      },
    ],
  },
  formula: {
    content: "",
    group: BLOCK_GROUP,
    atom: true,
    attrs: {
      id: { default: null },
      number: { default: null },
      asciimath: { default: null },
      mathml: { default: null },
      math_text: { default: null },
      ...DATA_ATTR,
    },
    toDOM: (node) => {
      const attrs: Record<string, string> = { class: "formula" };
      const asciimath = node.attrs["asciimath"] as string | null;
      const mathml = node.attrs["mathml"] as string | null;
      const number = node.attrs["number"] as string | null;
      if (asciimath !== null) {
        attrs["data-asciimath"] = asciimath;
      }
      if (mathml !== null) {
        attrs["data-mathml"] = mathml;
      }
      if (number !== null) {
        attrs["data-number"] = number;
      }
      return ["div", attrs];
    },
    parseDOM: [
      {
        tag: "div.formula",
        getAttrs: (el) => ({
          asciimath: el.getAttribute("data-asciimath"),
          mathml: el.getAttribute("data-mathml"),
          number: el.getAttribute("data-number"),
        }),
      },
    ],
  },
  quote: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["blockquote", 0],
    parseDOM: [{ tag: "blockquote" }],
  },
  review: {
    content: `${BLOCK_GROUP}+`,
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["div", { class: "review" }, 0],
    parseDOM: [{ tag: "div.review" }],
  },
  floating_title: {
    content: "",
    group: BLOCK_GROUP,
    atom: true,
    attrs: sectionAttrs(),
    toDOM: (node) => {
      const attrs: Record<string, string> = { class: "floating-title" };
      const id = node.attrs["id"] as string | null;
      if (id !== null) {
        attrs["data-id"] = id;
      }
      const title = node.attrs["title"] as string | null;
      return ["div", attrs, title ?? ""];
    },
    parseDOM: [
      {
        tag: ".floating-title",
        getAttrs: (el) => ({ title: el.textContent, id: el.getAttribute("data-id") }),
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 4. List nodes (§8.4)
// ---------------------------------------------------------------------------

const listNodes: Record<string, NodeSpec> = {
  bullet_list: {
    content: "list_item+",
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["ul", 0],
    parseDOM: [{ tag: "ul" }],
  },
  ordered_list: {
    content: "list_item+",
    group: BLOCK_GROUP,
    attrs: { order: { default: 1 }, ...DATA_ATTR },
    toDOM: (node) => {
      const order = node.attrs["order"] as number;
      const attrs: Record<string, number> = {};
      if (order > 1) {
        attrs["start"] = order;
      }
      return ["ol", attrs, 0];
    },
    parseDOM: [
      {
        tag: "ol",
        getAttrs: (el) => ({
          order: el.hasAttribute("start") ? Number(el.getAttribute("start")) : 1,
        }),
      },
    ],
  },
  list_item: {
    content: `${BLOCK_GROUP}+`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["li", 0],
    parseDOM: [{ tag: "li" }],
  },
  dl: {
    content: "(dt dd)+",
    group: BLOCK_GROUP,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["dl", 0],
    parseDOM: [{ tag: "dl" }],
  },
  dt: {
    content: `${INLINE_GROUP}*`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["dt", 0],
    parseDOM: [{ tag: "dt" }],
  },
  dd: {
    content: `${BLOCK_GROUP}+`,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["dd", 0],
    parseDOM: [{ tag: "dd" }],
  },
};

// ---------------------------------------------------------------------------
// 5. Table nodes (§8.5)
// ---------------------------------------------------------------------------

const tableNodes: Record<string, NodeSpec> = {
  table: {
    content: "(table_head | table_body | table_foot)+",
    group: BLOCK_GROUP,
    attrs: { id: { default: null }, number: { default: null }, title: { default: null }, ...DATA_ATTR },
    toDOM: () => ["table", 0],
    parseDOM: [{ tag: "table" }],
  },
  table_head: {
    content: "table_row+",
    attrs: { ...DATA_ATTR },
    toDOM: () => ["thead", 0],
    parseDOM: [{ tag: "thead" }],
  },
  table_body: {
    content: "table_row+",
    attrs: { ...DATA_ATTR },
    toDOM: () => ["tbody", 0],
    parseDOM: [{ tag: "tbody" }],
  },
  table_foot: {
    content: "table_row+",
    attrs: { ...DATA_ATTR },
    toDOM: () => ["tfoot", 0],
    parseDOM: [{ tag: "tfoot" }],
  },
  table_row: {
    content: "table_cell+",
    attrs: { ...DATA_ATTR },
    toDOM: () => ["tr", 0],
    parseDOM: [{ tag: "tr" }],
  },
  table_cell: {
    content: `${BLOCK_GROUP}+`,
    attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, ...DATA_ATTR },
    toDOM: (node) => {
      const colspan = node.attrs["colspan"] as number;
      const rowspan = node.attrs["rowspan"] as number;
      return ["td", { colspan, rowspan }, 0];
    },
    parseDOM: [{ tag: "td" }, { tag: "th" }],
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
      src: { default: null },
      ...DATA_ATTR,
    },
    toDOM: (node) => {
      const attrs: Record<string, string> = { class: "figure" };
      const id = node.attrs["id"] as string | null;
      if (id !== null) {
        attrs["data-id"] = id;
      }
      return ["figure", attrs, 0];
    },
    parseDOM: [{ tag: "figure" }],
  },
  image: {
    content: "",
    atom: true,
    draggable: true,
    attrs: { src: { default: "" }, alt: { default: null }, ...DATA_ATTR },
    toDOM: (node) => {
      const src = node.attrs["src"] as string;
      const alt = node.attrs["alt"] as string | null;
      const attrs: Record<string, string> = { src, "data-src": src };
      if (alt !== null) {
        attrs["alt"] = alt;
      }
      return ["img", attrs];
    },
    parseDOM: [
      {
        tag: "img",
        getAttrs: (el) => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") }),
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 7. Footnote nodes (§8.7)
// ---------------------------------------------------------------------------

const footnoteNodes: Record<string, NodeSpec> = {
  footnotes: {
    content: "footnote_entry+",
    attrs: { ...DATA_ATTR },
    toDOM: () => ["section", { class: "footnotes" }, 0],
    parseDOM: [{ tag: "section.footnotes" }, { tag: "ol.footnotes" }],
  },
  footnote_entry: {
    content: `${BLOCK_GROUP}+`,
    attrs: { id: { default: null }, number: { default: null }, ...DATA_ATTR },
    toDOM: (node) => {
      const attrs: Record<string, string> = { class: "footnote-entry" };
      const id = node.attrs["id"] as string | null;
      const number = node.attrs["number"] as string | null;
      if (id !== null) {
        attrs["data-id"] = id;
      }
      if (number !== null) {
        attrs["data-number"] = number;
      }
      return ["div", attrs, 0];
    },
    parseDOM: [
      {
        tag: ".footnote-entry",
        getAttrs: (el) => ({
          id: el.getAttribute("data-id"),
          number: el.getAttribute("data-number"),
        }),
      },
    ],
  },
    footnote_marker: {
      content: "",
      group: INLINE_GROUP,
      inline: true,
      atom: true,
      attrs: { id: { default: null }, target: { default: null }, ...DATA_ATTR },
      toDOM: (node) => {
        const attrs: Record<string, string> = { class: "footnote-marker" };
        const target = node.attrs["target"] as string | null;
        if (target !== null) {
          attrs["data-target"] = target;
        }
        return ["sup", attrs];
      },
      parseDOM: [
        {
          tag: "sup.footnote-marker",
          getAttrs: (el) => ({ target: el.getAttribute("data-target") }),
        },
      ],
    },
    stem: {
      content: "",
      group: INLINE_GROUP,
      inline: true,
      atom: true,
      attrs: {
        asciimath: { default: null },
        mathml: { default: null },
        ...DATA_ATTR,
      },
      toDOM: (node) => {
        const attrs: Record<string, string> = { class: "stem" };
        const asciimath = node.attrs["asciimath"] as string | null;
        const mathml = node.attrs["mathml"] as string | null;
        if (asciimath !== null) {
          attrs["data-asciimath"] = asciimath;
        }
        if (mathml !== null) {
          attrs["data-mathml"] = mathml;
        }
        return ["span", attrs];
      },
      parseDOM: [
        {
          tag: "span.stem",
          getAttrs: (el) => ({
            asciimath: el.getAttribute("data-asciimath"),
            mathml: el.getAttribute("data-mathml"),
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
    content: "",
    group: INLINE_GROUP,
    inline: true,
    atom: true,
    attrs: { ...DATA_ATTR },
    toDOM: () => ["br"],
    parseDOM: [{ tag: "br" }],
  },
};

// ---------------------------------------------------------------------------
// Assembled map (§10)
// ---------------------------------------------------------------------------

/**
 * The 43 node specs, in §3.1 group order.
 *
 * Exposed for consumers that compose a modified schema.
 */
export const metanormaNodes: Record<string, NodeSpec> = {
  ...structuralNodes,
  ...sectionNodes,
  ...blockNodes,
  ...listNodes,
  ...tableNodes,
  ...mediaNodes,
  ...footnoteNodes,
  ...leafInlineNodes,
};
