# Metanorma Mirror — Documentation Index

This directory holds the functional and component specifications for the
Metanorma Mirror rich-text editing stack. The three specs below describe a
layered architecture: a **schema** (data model) is consumed by an **editor
component** (React + ProseMirror), which in turn hosts a **toolbar** (user
operations). Each spec links to the others; the dependency flows downward.

```
schema.spec.md            ← source of truth for the document model
        ↑ consumed by
MetanormaProseMirror.spec.md  ← React editor component (mounts ProseMirror)
        ↑ hosts (as a child)
MetanormaToolbar.spec.md      ← schema-bound toolbar UI
```

---

## Component specifications

### [`schema.spec.md`](./schema.spec.md) — ProseMirror Schema

Defines the `prosemirror-model` `Schema` (`@metanorma/prosemirror-schema`) whose
node and mark vocabulary, content model, attributes, and DOM serialization rules
faithfully mirror the Metanorma Mirror document model derived from
`metanorma-mirror-js`'s `types.ts`. This is the **source of truth** for the
document model — 42 node types and 16 mark types.

| § | Section |
|---|---|
| 1 | [Purpose](./schema.spec.md#1-purpose) |
| 2 | [Module layout](./schema.spec.md#2-module-layout) |
| 3 | [Vocabulary (derived from `types.ts`)](./schema.spec.md#3-vocabulary-derived-from-typests) |
| 4 | [ProseMirror group design](./schema.spec.md#4-prosemirror-group-design) |
| 5 | [Content model overview](./schema.spec.md#5-content-model-overview) |
| 6 | [Attribute conventions](./schema.spec.md#6-attribute-conventions) |
| 7 | [`inclusive` / `excludes` conventions](./schema.spec.md#7-inclusive--excludes-conventions) |
| 8 | [Node specifications](./schema.spec.md#8-node-specifications) |
| 9 | [Mark specifications](./schema.spec.md#9-mark-specifications) |
| 10 | [Schema assembly](./schema.spec.md#10-schema-assembly) |
| 11 | [Public API (`index.ts`)](./schema.spec.md#11-public-api-index-ts) |
| 12 | [JSON round-trip (`MirrorNode` compatibility)](./schema.spec.md#12-json-round-trip-mirrornode-compatibility) |
| 13 | [TypeScript constraints](./schema.spec.md#13-typescript-constraints) |
| 14 | [Acceptance criteria](./schema.spec.md#14-acceptance-criteria) |
| 15 | [Default document](./schema.spec.md#15-default-document) |
| 16 | [Out of scope (v1)](./schema.spec.md#16-out-of-scope-v1) |

---

### [`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) — React Editor Component

Defines the `MetanormaProseMirror` React component (`@metanorma/prosemirror-editor`)
that wraps `@handlewithcare/react-prosemirror@3.2.7` and binds it to
`metanormaSchema`. Mounts a ProseMirror editor, supplies React node-view
components for atom/leaf and interactive nodes, and supports both controlled
(`state` + `onStateChange`) and uncontrolled usage. An **editor-mounting**
module — it does not ship commands, keymaps, or input rules.

| § | Section |
|---|---|
| 1 | [Purpose](./MetanormaProseMirror.spec.md#1-purpose) |
| 2 | [Module layout](./MetanormaProseMirror.spec.md#2-module-layout) |
| 3 | [Dependencies](./MetanormaProseMirror.spec.md#3-dependencies) |
| 4 | [Schema integration](./MetanormaProseMirror.spec.md#4-schema-integration) |
| 5 | [Component API — `MetanormaProseMirror`](./MetanormaProseMirror.spec.md#5-component-api--metanormaprosemirror) |
| 6 | [Types and EditorState setup](./MetanormaProseMirror.spec.md#6-types-and-editorstate-setup) |
| 7 | [Node views](./MetanormaProseMirror.spec.md#7-node-views) |
| 8 | [Mark views](./MetanormaProseMirror.spec.md#8-mark-views) |
| 9 | [Styling (`style.css`)](./MetanormaProseMirror.spec.md#9-styling-stylecss) |
| 10 | [Hooks available to children](./MetanormaProseMirror.spec.md#10-hooks-available-to-children) |
| 11 | [Public API (`index.ts`)](./MetanormaProseMirror.spec.md#11-public-api-index-ts) |
| 12 | [TypeScript constraints](./MetanormaProseMirror.spec.md#12-typescript-constraints) |
| 13 | [Acceptance criteria](./MetanormaProseMirror.spec.md#13-acceptance-criteria) |
| 14 | [Out of scope (v1)](./MetanormaProseMirror.spec.md#14-out-of-scope-v1) |

---

### [`MetanormaToolbar.spec.md`](./MetanormaToolbar.spec.md) — Toolbar Component

Defines `MetanormaToolbar`, a schema-bound React toolbar component
(`@metanorma/prosemirror-editor`) giving one-click access to common
document-manipulation operations — toggling inline marks, wrapping blocks,
inserting lists, and creating links — against `metanormaSchema`. Rendered as a
**child** of `MetanormaProseMirror` so it reads editor state and dispatches
transactions through the `@handlewithcare/react-prosemirror` context.

| § | Section |
|---|---|
| 1 | [Purpose](./MetanormaToolbar.spec.md#1-purpose) |
| 2 | [Package and export](./MetanormaToolbar.spec.md#2-package-and-export) |
| 3 | [Integration model](./MetanormaToolbar.spec.md#3-integration-model) |
| 4 | [Component API](./MetanormaToolbar.spec.md#4-component-api) |
| 5 | [Button specification](./MetanormaToolbar.spec.md#5-button-specification) |
| 6 | [Link URL input](./MetanormaToolbar.spec.md#6-link-url-input) |
| 7 | [State detection implementation](./MetanormaToolbar.spec.md#7-state-detection-implementation) |
| 8 | [Styling](./MetanormaToolbar.spec.md#8-styling) |
| 9 | [Accessibility](./MetanormaToolbar.spec.md#9-accessibility) |
| 10 | [Export changes](./MetanormaToolbar.spec.md#10-export-changes) |
| 11 | [File structure summary](./MetanormaToolbar.spec.md#11-file-structure-summary) |
| 12 | [TypeScript constraints](./MetanormaToolbar.spec.md#12-typescript-constraints) |
