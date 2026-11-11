# editor-gui

The browser entry point for the Metanorma editor. Bundled by the repo-root
[`build-gui.mjs`](../../build-gui.mjs) (esbuild + Yarn-PnP plugin) into
`pkg/editor-gui/dist/`.

## Architecture overview

## Panel definitions

| Concern | File |
|---|---|
| Panel components + the registry (a module-level constant — identity-stable, so panels never remount on App re-renders) | [`panels.tsx`](./panels.tsx) |
| Default layout: panels record, main-grid leaf, floating windows; `FLOAT_PANELS` geometry/title seeds shared with the reopen path | [`presetLayout.ts`](./presetLayout.ts) |
| Editor-gui-local context crossing the panel boundary (`DocEpochContext` — re-keys the minimap on doc load) | [`panelContexts.ts`](./panelContexts.ts) |
| Panels control (reopen closed floats at preset geometry via `api.addPanel({…, floating}))` | [`ChromeBar.tsx`](./ChromeBar.tsx) |
| Storage key + envelope format | [`panelPersistence.ts`](./panelPersistence.ts) |

Registry key = panel id = dockview `contentComponent` name (single-entry
form; see `@metanorma/panel-layout` api.spec.md §2.5 for the full
registry contract, title precedence, and floors).

### Defining a panel

1. **Component** in `panels.tsx`: `FC<IDockviewPanelProps>` (type
   re-exported from `@metanorma/panel-layout`). The root element fills
   the fixed-height box the library hosts it in; use a plain global
   class (like `.mn-doc-panel`) — prod builds hash-rename CSS-module
   classes, so CSS interop and e2e selectors key on globals only. Editor
   context (`useEditorEffect`) and `DocEpochContext` are reachable from
   inside panels.
2. **Registry entry** in the same file. The key doubles as the panel id;
   add `floatable: false` only if the panel must never enter a float.
3. **Preset slot** in `presetLayout.ts`: add to the `panels` record, then
   either a main-grid leaf (repeat `hideHeader`/`locked` there for a
   non-closable full-bleed surface) or a `floatingGroups` window (nested
   `VERTICAL` grid; leaf size = tabset height = window height −
   `CONSTANTS.undockChrome`).
4. **Reopenable after close?** Add a `FLOAT_PANELS` seed and extend the
   id union + button list in `ChromeBar.tsx`.
5. **Rules of thumb**: never put live state in dockview `params` (they
   serialize into the layout envelope — use context); keep the registry
   module-level; a stored envelope from before your panel existed won't
   show it (stored layout wins), so ship the reopen path or accept the
   key-bump reset.
6. **Tests**: subject-level assertions go in `layout.spec.ts`/
   `chrome.spec.ts` patterns (`openEditor`, floats in place); specs that
   click document content use `openParkedEditor` (see
   [`e2e/helpers.ts`](./e2e/helpers.ts)).

## Development

### Build

```
yarn build-gui          # → pkg/editor-gui/dist/{index.html, bootstrap.js, bootstrap.css}
yarn build-gui:dev      # unminified, React in dev mode, StrictMode flag set
```

Serve `pkg/editor-gui/dist/` over `http://` — ES module `<script type="module">`
tags require an http origin; `file://` will not work. A zero-dependency static
server lives at [`e2e/serve.mjs`](./e2e/serve.mjs):

```
node pkg/editor-gui/e2e/serve.mjs     # → http://localhost:3333
```

### End-to-end tests (Playwright)

The `e2e/` directory holds a Playwright suite with sixteen spec files:

| Spec | What it covers |
|------|----------------|
| `smoke` | Build boots, editor renders, typing works, doc-JSON hook live, bootstrap mount quirk. |
| `chrome` | Top chrome bar: Save/Open buttons; Panels control disabled while a panel is open, reopening a closed float; doc rehydration via the test hook. |
| `layout` | Panel-layout integration regressions: doc panel full-bleed and non-closable, the two floating panels over the grid, close→reopen at preset geometry, layout envelope persistence across reload. |
| `minimap` | Consumer-owned minimap integration: floating-window placement, drag-scrolls-the-editor smoke, doc-load state swap. |
| `popovers` | Toolbar pickers (TableSizePicker, FootnotePicker, ImageInsertDialog, XrefPicker, ConceptPicker) are reachable and clickable; popover flows apply their edits. |
| `prompts` | The five `window.prompt` flows (link / xref / eref / concept / clause heading) plus the cancel path; guards the async stale-view fix. |
| `keyboard` | Enter / Shift-Enter / Backspace chains through real `keydown`; Bold toggle via the toolbar; definition-list enter/backspace behavior. |
| `section-title` | Section title `<input>` keeps its keystrokes and focus; commits on blur. |
| `section-insert` | Section-type popover: every insertion kind lands at the right structural level (clause/abstract/references/annex, promote/demote edge cases). |
| `table-resize` | Fixed-width table colgroups, column drag resizing, clipboard round-trips with `data-colwidths`, drag hygiene. |
| `figures` | Two-stage figure authoring (Figure button seeds caption + placeholder; Image fills it), deletion recovery, node-selection clicks. |
| `caption` | Table and figure caption seeding, rich markup in captions, backspace semantics on empty captions. |
| `image-sizing` | Image parseDOM size normalization on paste, node-view paint of authored sizes, Size popover flows, natural-size backfill plugin. |
| `bcp14` | Bcp14 picker dialog wraps a selection with MUST/SHOULD-style keywords. |
| `stem-formula` | Stem block flows (asciimath/mathml source entry and rendering). |
| `plugin-smoke` | Rendering-only assertions for the DOM-rendering plugins (colgroup widgets, resize handles, placeholders) — plugin rendering is verified here per repo rule. |

Two setup conventions (see `helpers.ts`): specs whose subject is the
layout surface (`layout`, `minimap`, `chrome`'s Panels test) use
`openEditor` with the preset floats in place; everything else uses
`openParkedEditor`, which closes the minimap window and parks the toolbar
window at the right edge — the preset parks both floats over the
document's opening content, where left-edge caret clicks land.

#### Running the suite

```
yarn workspace editor-gui e2e          # headless run
yarn workspace editor-gui e2e:ui       # interactive UI mode (watch + inspector)
```

Playwright's `webServer` builds the GUI (`yarn build-gui`) and starts
`e2e/serve.mjs` automatically before the first test, then tears both down at the
end. To reuse a running server during iteration, set `reuseExistingServer`
(which is the default outside CI).

#### Prerequisites — ordinary machine

1. **Node 20+** and **Yarn 4** (`corepack enable`).
2. **`yarn install`** at the repo root (sets up PnP).
3. **Browser + OS libraries:**

   ```
   yarn workspace editor-gui e2e:install
   ```

   This runs `playwright install chromium` (downloads the browser binary to
   `~/.cache/ms-playwright`) and `playwright install-deps chromium` (installs
   the OS-level shared libraries Chromium needs). On macOS and Windows
   `install-deps` is a no-op — the libraries ship with the OS; it only runs
   `apt-get` on Linux.

#### Prerequisites — Linux container (e.g. an arm64 container)

The same `e2e:install` script works inside a container, provided the container
runs as **root** (for `apt-get`) and has **outbound network** (to reach the
Playwright CDN). Notes for this kind of environment:

- **Architecture:** **arm64/aarch64 is supported** — Playwright ships arm64
  Linux Chromium builds. No x86 emulation is needed. Verify with
  `npx playwright --version` ≥ 1.49.

- **System libraries:** Chromium (even headless) dynamically links against a
  stack of libraries that are not in a minimal base image. The known-required
  set: `libnss3`, `libnssutil3`, `libatk1.0-0`, `libatk-bridge2.0-0`,
  `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libasound2`,
  plus `libgbm1`, `libdrm2`, `libxkbcommon0`, `libcups2`, `libpango-1.0-0`,
  `libcairo2` (the last group is usually already present).
  `playwright install-deps chromium` installs all of them via `apt-get`.

  To check which are missing before installing:
  ```
  for lib in libnss3.so libatk-1.0.so.0 libxcomposite.so.1 libasound.so.2; do
    find /usr/lib /usr/lib64 -name "$lib" 2>/dev/null | head -1 || echo "MISS $lib"
  done
  ```

- **Ephemeral filesystem:** if the container's filesystem does not persist
  across sessions (common in CI and disposable dev containers), re-run
  `yarn workspace editor-gui e2e:install` each session. It pulls ~150 MB
  (browser binary + apt packages) and takes ~1–2 minutes on a warm network.
  Only the repo source and the Yarn PnP cache (`.yarn/cache`) must persist
  between sessions.

- **No display needed:** the suite runs headless
  (`chromium.launch({ headless: true })`); no X server / Wayland is required.

- **The `fsevents` warning is harmless:** on Linux, `playwright-core` optionally
  imports the macOS-only `fsevents` module. Yarn PnP prints
  `playwright-core tried to access fsevents, but it isn't declared in its
  dependencies` — this is a warning, not an error, and does not affect
  functionality.

#### The `?e2e=1` test hook

When the page is loaded with `?e2e=1` in the query string, `App.tsx` exposes a
read-only `window.__mnGetDoc()` function that returns the current ProseMirror
document as JSON. Specs use this to assert structural state (node types,
attributes, marks) without scraping the DOM. Without the flag, the hook is
absent — it has no effect in normal use.

#### Current status

No known failing tests at this writing (chromium project, full suite,
98 tests green). Two bugs this section previously recorded no longer
reproduce, and the stale claims are retired:

1. **Popover occlusion** (was "all 3 tests fail"): in the old right-docked
   vertical-toolbar layout, `.mn-toolbar--vertical`'s `overflow-y: auto`
   forced `overflow-x: auto`, clipping the absolutely-positioned
   leftward-opening popovers. The panel-layout integration moved the
   toolbar into a floating window and the symptom does not reproduce —
   all six picker/dialog tests in `popovers.spec.ts` click through their
   popovers successfully. (Two of the six initially failed after the
   integration from a different cause — the preset's top-left floating
   windows intercepting caret-placement clicks — fixed by the
   `openParkedEditor` setup, not by toolbar changes. The spec has also
   grown from the three tests the old text described to six.)

2. **`canInsertBlock` always false inside a paragraph** (was "1 test
   skipped"): `keyboard.spec.ts` contains no skipped test, and the
   definition-list tests click the `Def list` button unguarded — a live
   bug would surface as a failure. The full keyboard spec passes, so the
   button enables and inserts correctly from paragraph context. Nothing
   in the panel-layout integration touches `editor-commands`; the
   discrepancy is retired as a stale record, not attributed to a fix
   here.
