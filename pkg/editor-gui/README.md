# editor-gui

The browser entry point for the Metanorma editor. Bundled by the repo-root
[`build-gui.mjs`](../../build-gui.mjs) (esbuild + Yarn-PnP plugin) into
`pkg/editor-gui/dist/`.

## Build

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

## End-to-end tests (Playwright)

The `e2e/` directory holds a Playwright suite with five spec files:

| Spec | What it covers |
|------|----------------|
| `smoke` | Build boots, editor renders, typing works, doc-JSON hook live, bootstrap mount quirk. |
| `popovers` | TableSizePicker, FootnotePicker, ImageInsertDialog are reachable and not occluded by the editor. Each test performs a real click inside the dialog, which fails loudly if the editor intercepts it. |
| `prompts` | The five `window.prompt` flows (link / xref / eref / concept / clause heading) plus the cancel path; guards the async stale-view fix. |
| `keyboard` | Enter / Shift-Enter / Backspace chains through real `keydown`; Bold toggle via the toolbar. |
| `section-title-isolation` | Section title `<input>` keeps its keystrokes and focus; commits on blur. |

### Running the suite

```
yarn workspace editor-gui e2e          # headless run
yarn workspace editor-gui e2e:ui       # interactive UI mode (watch + inspector)
```

Playwright's `webServer` builds the GUI (`yarn build-gui`) and starts
`e2e/serve.mjs` automatically before the first test, then tears both down at the
end. To reuse a running server during iteration, set `reuseExistingServer`
(which is the default outside CI).

### Prerequisites — ordinary machine

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

### Prerequisites — Linux container (e.g. an arm64 container)

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

### The `?e2e=1` test hook

When the page is loaded with `?e2e=1` in the query string, `App.tsx` exposes a
read-only `window.__mnGetDoc()` function that returns the current ProseMirror
document as JSON. Specs use this to assert structural state (node types,
attributes, marks) without scraping the DOM. Without the flag, the hook is
absent — it has no effect in normal use.

### Current status

The suite currently surfaces two real product bugs (the suite is doing its job):

1. **Popover occlusion** (`popovers.spec.ts`, all 3 tests fail): in the vertical
   toolbar layout, `.mn-toolbar--vertical` has `overflow-y: auto`, which forces
   `overflow-x` to compute to `auto` as well (per CSS spec, when one axis is
   `visible` and the other isn't, `visible` becomes `auto`). This clips the
   absolutely-positioned popovers (`.mn-toolbar-popover`, `.mn-toolbar-dialog`)
   that open leftward via `right: 100%`, so they are unclickable over the
   editor area. Playwright reports: `<div class="ProseMirror"> intercepts
   pointer events`. The `FootnotePicker` (HTML Popover API, top-layer) is the
   intended fix pattern.

2. **`canInsertBlock` always returns false inside a paragraph**
   (`keyboard.spec.ts`, 1 test skipped): `canInsertBlock` in
   `pkg/editor-commands/commands/definitionList.ts` checks
   `$from.parent.contentMatchAt($from.index()).matchType(dlType)`, but the
   paragraph's contentMatch only accepts inline content, so `dl` (a block) never
   matches. The predicate should check the clause parent's contentMatch, not the
   paragraph's. This makes the `Def list` button permanently disabled.
