# Spec changelog

Curated records of significant spec transitions. Not every spec edit appears
here — routine changes are in `git log -- docs/`. Entry bar: the change spans
multiple commits or specs, or its narrative isn't recoverable from commit
messages. See [CONVENTIONS.md](./CONVENTIONS.md) §4.

---

## Seeded entries (pre-governance-migration)

The entries below were reconstructed from Git history and decisionmaking prose
dispersed across the specs. Dates and commit SHAs are approximate (some
transitions span multiple days or are buried in multi-purpose commits).

---

### 2026-08-10/11 — Bibliographic model: Relaton package + bibdata/bibitem nodes

New `@metanorma/relaton` workspace package with a deliberate-subset
BibliographicItem type, pure derivation helpers (`citeas`, `label`,
`primaryDocid`, `mainTitle`), and a zero-PM-dependency document walker
(`collectBibliographyItems`). The schema gained `bibdata` (a required
first-child atom storing document metadata) and `bibitem` (a bibliography-entry
atom inside `references` sections). The editor gained `BibNodeView` (popover
editing via a shared `BibliographicItemForm`) and the toolbar gained an
`ErefPicker` that consults `collectBibliographyItems` for known citations.

**Affected specs:** schema.spec.md §3/§8, Relaton.spec.md (new),
MetanormaProseMirror.spec.md §7.

**Commits:** `e34d628`, `ca6ba81`.

---

### 2026-08-09 — Section headings: title attribute → section_title child node

Section nodes gained an optional `section_title` child textblock (content
`inline*`), enabling inline markup (emphasis, links) in headings. The `title`
string attribute was removed from `sectionAttrs()`. `floating_title` was
converted from an atom to a textblock. `SectionNodeView` and
`FloatingTitleNodeView` were deleted in favour of native `toDOM` rendering.
The `exitSectionTitle` command (Enter inside `section_title` exits to the body)
was added.

**Affected specs:** schema.spec.md §8.2/§8.3, EditorCommands.spec.md §2.4.8,
AdvancedMetanormaToolbar/sections.md §7.

**Commits:** `12178f9`.

---

### 2026-07-25/26 — Toolbar labels: glyphs → words

Every toolbar button's visible `label` changed from a glyph/emoji/short token
(e.g. `❝`, `🔗`, `B`, `↩`, `▦`, `↶`) to a short legible word (e.g. `Quote`,
`Link`, `Bold`, `Outdent`, `Table`, `Undo`). The `title` field (tooltip) is
unchanged and remains the sole channel for longer per-button descriptions.
Button tables across all toolbar specs were restructured to carry explicit
Label and Title columns.

**Affected specs:** MetanormaToolbar.spec.md §5,
AdvancedMetanormaToolbar/README.md, all six AMT member pages.

**Commits:** `becbd6d`, `d385f04`.

---

### 2026-07-25 — Outdent button added to AMT

New `outdent` toolbar group wrapping the stock ProseMirror `lift` command.
The button is enabled when the cursor's textblock can be lifted (has a valid
`liftTarget`); it is disabled inside definition lists (`dl`/`dt`/`dd`) to
preserve the `(dt dd)+` invariant. New spec page `outdent.md`.

**Affected specs:** AdvancedMetanormaToolbar/README.md §5.1,
AdvancedMetanormaToolbar/outdent.md (new).

**Commits:** `337dba9`.

---

### 2026-07-25 — Toolbar moved to own package (@metanorma/toolbar)

`MetanormaToolbar` was reshaped from a self-contained monolith into a thin
assembler over shared primitives (`<Toolbar>` shell, `<ToolbarButtonView>`,
`ToolbarButton` / `ToolbarEntry` / `ToolbarGroupDef` types, `baseGroups`
registry). `toggleList` was rewritten as a pure
`(state, dispatch?) => boolean` command and relocated to
`@metanorma/editor-commands`. The whole toolbar — assembler plus shared
primitives — moved into its own workspace package `@metanorma/toolbar`
(`pkg/toolbar/`), with a clean break: `@metanorma/prosemirror-editor` no longer
exports or references the toolbar. The public component API is unchanged.

**Affected specs:** MetanormaToolbar.spec.md §10–§12,
AdvancedMetanormaToolbar/README.md §5.

**Commits:** `49e999d`, `0c3bb10`.

---

### 2026-07-24/25 — Schema parity with Metanorma Presentation XML

Two dual-source-of-truth issues resolved for unambiguous PM→Presentation-XML
conversion: (1) `figure` no longer carries `src` — `src` lives only on the
`image` child; (2) `formula` and `stem` gained a `type` discriminator (enum
`asciimath` | `mathml`, default `asciimath`) selecting the authoritative
encoding; `math_text` was removed from `formula`. New §1.1 (coverage/subset
principle: the schema is a convertible subset, not a lossless round-trip) and
§17 (conversion guide: invent-on-export values, dropped-on-import features,
over-permissive content) added.

**Affected specs:** schema.spec.md §1.1/§6/§8/§9/§17.

**Commits:** `da40009`, `f1b2dd4`.

---

### 2026-07-24 — toggleList moved from Toolbar spec to EditorCommands

The `toggleList` command definition relocated from MetanormaToolbar.spec.md to
EditorCommands.spec.md §3 (three-branch algorithm: unwrap same / switch
different with single-transaction lift+wrap / wrap none; dl-exclusion).
MetanormaToolbar.spec.md §5.3 retains only the button (active/enabled detection
+ run adapter) and references EditorCommands §3 for the command contract.

**Affected specs:** EditorCommands.spec.md §3, MetanormaToolbar.spec.md §5.3,
AdvancedMetanormaToolbar/definition-lists.md.

**Commits:** `5207122`.

---

### 2026-07-20 — AMT refactored to command-layering model

All seven AdvancedMetanormaToolbar member pages were restructured to defer
command logic to `@metanorma/editor-commands`. The toolbar owns only UI
adapters (`run(view)` → `command(view.state, view.dispatch)` + `view.focus()`),
popovers, dialogs, and keymap plugins. The command-layering rule (README §6)
was introduced: pure commands are `(state, dispatch?) => boolean` functions —
no EditorView, no DOM, no `view.focus()`, non-throwing.

**Affected specs:** AdvancedMetanormaToolbar/README.md §6, all six AMT member
pages.

**Commits:** `9a4a8ba`.

---

### 2026-07-16/17/18 — Initial spec set created

Schema, MetanormaProseMirror, MetanormaToolbar, and EditorCommands specs
written from scratch, establishing the layered architecture (schema → editor →
toolbar) and the cross-spec reference graph. The seven-page
AdvancedMetanormaToolbar spec (README + tables, images-figures, sections,
reference-marks, definition-lists, undo-redo) was written in the same burst,
covering the six feature areas the base toolbar defers.

**Affected specs:** schema.spec.md, MetanormaProseMirror.spec.md,
MetanormaToolbar.spec.md, EditorCommands.spec.md,
AdvancedMetanormaToolbar/README.md + 6 member pages.

**Commits:** `fcb7ecb`, `cdfa6a4`, `1c4f27d`.
