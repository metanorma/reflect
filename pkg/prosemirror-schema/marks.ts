/**
 * Mark specifications — the 15-mark `marks` map passed to `new Schema` (§9).
 *
 * Formatting marks (§9.1) keep the default `inclusive: true`; reference /
 * semantic marks (§9.2) set `inclusive: false` (§7).
 */

import type { MarkSpec } from "prosemirror-model";

import { DATA_ATTR } from "./attrs.js";

// ---------------------------------------------------------------------------
// 1. Formatting marks (§9.1)
// ---------------------------------------------------------------------------

const formattingMarks: Record<string, MarkSpec> = {
  emphasis: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["em", 0],
    parseDOM: [{ tag: "em" }, { tag: "i" }],
  },
  strong: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["strong", 0],
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
  },
  subscript: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["sub", 0],
    parseDOM: [{ tag: "sub" }],
  },
  superscript: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["sup", 0],
    parseDOM: [{ tag: "sup" }],
  },
  code: {
    // §7: non-exclusive; may co-exist with other marks.
    attrs: { ...DATA_ATTR },
    toDOM: () => ["code", 0],
    parseDOM: [{ tag: "code" }],
  },
  underline: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["u", 0],
    parseDOM: [{ tag: "u" }],
  },
  strike: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["s", 0],
    parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }],
  },
  smallcap: {
    attrs: { ...DATA_ATTR },
    toDOM: () => ["span", { class: "smallcap" }, 0],
    parseDOM: [
      { tag: "span.smallcap" },
      { style: "font-variant=small-caps" },
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. Reference / semantic marks (§9.2) — inclusive: false (§7)
// ---------------------------------------------------------------------------

/** Pull a string-valued mark attribute, tolerating `null`. */
function markAttr(mark: { attrs: Record<string, unknown> }, key: string): string | null {
  const v = mark.attrs[key];
  return typeof v === "string" ? v : null;
}

const referenceMarks: Record<string, MarkSpec> = {
  link: {
    inclusive: false,
    attrs: { href: { default: null }, target: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = {};
      const href = markAttr(mark, "href");
      const target = markAttr(mark, "target");
      if (href !== null) {
        attrs["href"] = href;
      }
      if (target !== null) {
        attrs["target"] = target;
      }
      return ["a", attrs, 0];
    },
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (el) => ({
          href: el.getAttribute("href"),
          target: el.getAttribute("target"),
        }),
      },
    ],
  },
  xref: {
    inclusive: false,
    attrs: { target: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: "xref" };
      const target = markAttr(mark, "target");
      if (target !== null) {
        attrs["data-target"] = target;
      }
      return ["a", attrs, 0];
    },
    parseDOM: [
      {
        tag: "a.xref",
        getAttrs: (el) => ({ target: el.getAttribute("data-target") }),
      },
    ],
  },
  eref: {
    inclusive: false,
    attrs: { cite: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: "eref" };
      const cite = markAttr(mark, "cite");
      if (cite !== null) {
        attrs["data-cite"] = cite;
      }
      return ["cite", attrs, 0];
    },
    parseDOM: [
      {
        tag: "cite.eref",
        getAttrs: (el) => ({ cite: el.getAttribute("data-cite") }),
      },
    ],
  },
  footnote: {
    inclusive: false,
    attrs: { id: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: "footnote" };
      const id = markAttr(mark, "id");
      if (id !== null) {
        attrs["data-id"] = id;
      }
      return ["sup", attrs, 0];
    },
    parseDOM: [
      {
        tag: "sup.footnote",
        getAttrs: (el) => ({ id: el.getAttribute("data-id") }),
      },
    ],
  },
    concept: {
    inclusive: false,
    attrs: { ref: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: "concept" };
      const ref = markAttr(mark, "ref");
      if (ref !== null) {
        attrs["data-ref"] = ref;
      }
      return ["span", attrs, 0];
    },
    parseDOM: [
      {
        tag: "span.concept",
        getAttrs: (el) => ({ ref: el.getAttribute("data-ref") }),
      },
    ],
  },
  bcp14: {
    inclusive: false,
    attrs: { type: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = { class: "bcp14" };
      const type = markAttr(mark, "type");
      if (type !== null) {
        attrs["data-type"] = type;
      }
      return ["span", attrs, 0];
    },
    parseDOM: [
      {
        tag: "span.bcp14",
        getAttrs: (el) => ({ type: el.getAttribute("data-type") }),
      },
    ],
  },
  span: {
    inclusive: false,
    attrs: { class: { default: null }, ...DATA_ATTR },
    toDOM: (mark) => {
      const attrs: Record<string, string> = {};
      const cls = markAttr(mark, "class");
      if (cls !== null) {
        attrs["class"] = cls;
      }
      return ["span", attrs, 0];
    },
      // §9.2: low priority so span.smallcap / span.concept /
      // span.bcp14 win during HTML ingestion.
    parseDOM: [
      {
        tag: "span[data-class]",
        getAttrs: (el) => ({ class: el.getAttribute("data-class") }),
        priority: 1,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Assembled map (§10)
// ---------------------------------------------------------------------------

/**
 * The 15 mark specs, in §3.2 order.
 *
 * Exposed for consumers that compose a modified schema.
 */
export const metanormaMarks: Record<string, MarkSpec> = {
  ...formattingMarks,
  ...referenceMarks,
};
