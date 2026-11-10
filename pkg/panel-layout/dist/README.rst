panel-layout build output
=========================

Everything in this directory except this README is generated and
gitignored. Regenerate with::

  yarn workspace @metanorma/panel-layout build

(root alias: ``yarn build-panel-layout``; continuous rebuild for local
development: ``node tests/parity/serve.mjs --watch``, which serves
http://127.0.0.1:4173 and rebuilds on change in one process tree.)

The builder (repo-root ``build-panel-layout.mjs``) emits two proof
targets, one per consumption mode of the library:

``mock/panel-layout.js``
  The MOCK-FACING artifact: entry ``internal.ts`` (the dev-only internal
  surface — the behavior modules plus the PanelLayout composition), every
  peer dependency EXTERNAL (``react``, ``react-dom``, ``dockview-react``
  and their subpaths — wildcards, so the ``react/jsx-runtime`` specifier
  that automatic JSX emits stays external too). It proves peer semantics:
  the package works when the consumer supplies the engine. Served at
  ``http://127.0.0.1:4173/dist/mock/panel-layout.js`` by the parity
  server — the REWIRED reference mock imports it there, and the synthetic
  harness (``tests/parity/harness.html``) does too. The
  build asserts (from the esbuild metafile) that the dockview/dockview-core
  packages appear nowhere in the module graph — runtime engine imports from
  the library would load a second dockview-core instance next to the one
  inlined in the mock's bundled ``dockview-react`` (broken drag-and-drop);
  the source-level twin of this check is ``scripts/check-imports.mjs``
  (``yarn imports:check``). NOTE: the PnP resolver plugin honors the
  externals list (a bare specifier matching an external pattern stays
  external — the custom onResolve claims specifiers before esbuild's own
  resolver would apply `external`); this first mattered when
  ``panelLayout.tsx`` became the package's first runtime ``dockview-react``
  import.

``twin/panel-layout.js``
  The TWIN-FACING artifact: entry ``index.ts`` (the public surface),
  nothing external — the engine is bundled from the yarn-installed
  exact 7.0.4 pins. It proves version truth with what the product will
  get. It is a TEST ARTIFACT, not a ship format: the package ships
  source/peer per its exports map. Duplicate-instance protection is
  yarn's own gate (``yarn check-for-multiple-instances``).

Engine-pin drift note: ``windowDrag.ts``'s ``normalizeTops`` takes
its container rect from the overlay element's ``parentElement``, relying
on the verified dockview-core 7.0.4 fact that the Overlay constructor
appends its element to ``overlay.options.container`` (the function's
comment records the equivalence to the mock's private ``options`` hop).
Bumping the engine pins requires re-verifying that equivalence.

The DEMO artifacts (demo task — one per flavor, entry
``demo/index.ts``, output name ``panel-layout-demo.js``):

``mock/panel-layout-demo.js``
  The mock-facing demo surface: peers AND the library itself external —
  the demo's consumer-shaped bare import
  ``'@metanorma/panel-layout'`` resolves through the reference mock's
  importmap (mapped to ``/dist/mock/panel-layout.js``), so the demo
  bundle consumes the built library exactly as a third-party consumer
  would. The thinned reference mock imports BOTH artifacts and mounts
  ``DemoApp`` — its inline remainder is the boot overlay and the app-shell
  CSS; the library chrome arrives via the linked sheets (hand-owned). The
  metafile assert's external allow-list gains ``@metanorma/panel-layout``
  for this target (everything external remains importmap-suppliable).

``twin/panel-layout-demo.js``
  The twin-facing demo surface: nothing external — the library is aliased
  from the bare ``'@metanorma/panel-layout'`` import to the PUBLIC entry
  ``index.ts`` (never ``internal.ts``) and bundled together with the
  engine from the yarn pins. Like its library sibling it is a test
  artifact; its consumer is the twin parity target
  (``tests/parity/twin.html``), which mounts via the demo surface's
  ``mountDemoApp`` (the mount seam) — the bundles carry no page-usable react.

Deferred items that LANDED with the convergence task (module 1 +
mock rewiring):

- Mock rewiring: DONE — the reference mock imports
  ``/dist/mock/panel-layout.js`` and carries zero inline behavior glue
  (demo panels, preset, toolbar/statusbar chrome and the boot/importmap
  head remain). The parity suite proves the built artifact reproduces the
  UNCHANGED goldens; module 1 composes the wiring order, the §2.1 option
  split and the mock's layout-save timing through the persistence
  facade (the synchronous save net — see panelLayout.tsx's header).
- CSS linking: DONE — the mock links the served ``/panel-layout.css`` and
  ``/focus.css`` after dockview.css (hand-authored; layoutArea-scoped), and
  since the extraction-pipeline decommission those links are the SOLE
  source of the library chrome: the extractor-duplicated inline
  ``:root``/chrome blocks were deleted from the mock in the same change,
  and the parity suite
  passed against the UNCHANGED goldens (the cascade proof — the linked
  sheet was byte-identical to the deleted inline copies).
  ``panel-layout.css`` also carries the J7 reduced-motion block
  (behavior.spec.md §3 J7).
- Single-instance parity test: the mock-facing bundle's externals assert
  (metafile) already cover the engine-copy guarantee; a page-level
  resource-count spec remains follow-up work with the twin target.

Deferred items that LANDED with the demo task:

- Demo surface extraction: DONE — ``@metanorma/panel-layout/demo``
  (``demo/index.ts``, exports-map subpath) carries the 11 panel bodies,
  the registry (doc policy key on the panel id), the preset, the two-key storage
  config, the toolbar/statusbar chrome and ``DemoApp``; it consumes only
  the public API plus the react peer. The demo stylesheet is
  ``demo/panel-content.css`` (byte-identical migration of the mock's
  panel-content CSS region); the mock links it relatively
  (``../demo/panel-content.css`` — parity server, goldens server and
  file:// all resolve it). App-chrome CSS stays inline in the mock by
  design; where it lives for a host other than the mock is the twin
  loop's decision.
- Mock thinning: DONE — the mock keeps zero demo content, zero chrome
  JSX and zero registrations inline; since the decommission its remainder is also free
  of the dead-data extraction anchors and the extractor-duplicated
  library-chrome/``:root`` CSS (boot/head, app-shell CSS, and one
  two-import mount of ``DemoApp``). The parity suite passes UNCHANGED
  against the same goldens through the extracted demo.

Extraction-pipeline decommission:

- ``panel-layout.css`` and ``mock/design-tokens.json`` are HAND-OWNED
  sources of truth (headers no longer claim GENERATED; provenance = git
  history; payloads frozen byte-for-byte from the pipeline's final run —
  ``mock/design-tokens.json`` `_provenance` records that snapshot). The
  extract scripts and the ``tokens:extract``/``tokens:check`` package
  scripts are retired; nothing else invoked them (CI never did). The
  standing consistency guard is in-suite: ``tests/tokens.test.mjs``
  cross-checks the JSON's ``TOKENS``/``DV_TOKENS`` against the
  declarations parsed out of ``panel-layout.css``. The JSON stays at
  ``mock/design-tokens.json`` — the parity harness
  (``tests/parity/harness.html``) imports it at that hardcoded path.
- ``capture:states`` caveat: that tool serves the mock with
  ``mock/`` as its server root, so the mock's absolute links
  (``/panel-layout.css``, ``/focus.css``, and since the demo task
  ``/demo/panel-content.css``) are unreachable there; frame REGENERATION
  needs a server-root change (the tool lives in an untouchable dir) or
  absolute-path links. Before the decommission the inline duplication
  masked the two library links; the checked-in frames remain valid
  (``--check-only`` reads frame files, not the live mock), and the
  parity/goldens servers (rooted at ``pkg/panel-layout/``) resolve every
  link.

LANDED with the twin loop: twin assembly + first twin parity
run (green out of the box — the twin reproduces every semantic golden
the mock captured; 5 new twin pixel baselines minted, existing baselines
bit-identical) and the app-chrome CSS decision
(``demo/app-chrome.css``).

Still open:

- Synthetic-suite audit beyond the convergence rows .
- Regenerating the state frames from the thinned mock
  (``capture:states``) needs the demo stylesheet — and, since the decommission, the
  library sheets — reachable from that tool's server root (it serves the
  mock from ``mock/`` today); see the extended caveat in the
  decommission section above. Until then the existing checked-in frames
  remain the verification source.
