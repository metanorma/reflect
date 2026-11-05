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

The DEMO artifacts (demo task, D38/D39 — one per flavor, entry
``demo/index.ts``, output name ``panel-layout-demo.js``):

``mock/panel-layout-demo.js``
  The mock-facing demo surface: peers AND the library itself external —
  the demo's consumer-shaped bare import
  ``'@metanorma/panel-layout'`` resolves through the reference mock's
  importmap (mapped to ``/dist/mock/panel-layout.js``), so the demo
  bundle consumes the built library exactly as a third-party consumer
  would. The thinned reference mock imports BOTH artifacts and mounts
  ``DemoApp`` — its inline remainder is the boot overlay, the app-shell +
  library-chrome CSS (extraction anchors, D35) and a dead-data design-token
  anchor block (titles/preset/storage keys/constants/engine-option
  literals; ``tests/demo.test.mjs`` drift-guards the duplication). The
  metafile assert's external allow-list gains ``@metanorma/panel-layout``
  for this target (everything external remains importmap-suppliable).

``twin/panel-layout-demo.js``
  The twin-facing demo surface: nothing external — the library is aliased
  from the bare ``'@metanorma/panel-layout'`` import to the PUBLIC entry
  ``index.ts`` (never ``internal.ts``) and bundled together with the
  engine from the yarn pins. Like its library sibling it is a test
  artifact; its consumer (the twin harness) arrives with the twin loop.

Deferred items that LANDED with the convergence task (module 1 +
mock rewiring):

- Mock rewiring: DONE — the reference mock imports
  ``/dist/mock/panel-layout.js`` and carries zero inline behavior glue
  (demo panels, preset, toolbar/statusbar chrome and the boot/importmap
  head remain). The parity suite proves the built artifact reproduces the
  UNCHANGED goldens; module 1 composes the wiring order, the §2.1 option
  split (D26) and the mock's layout-save timing through the persistence
  facade (the synchronous save net — see panelLayout.tsx's header).
- CSS linking: DONE — the mock links the served ``/panel-layout.css`` and
  ``/focus.css`` after dockview.css (D28/D30). The library chrome blocks
  REMAIN in the mock's inline ``<style>`` as the extraction source the
  tokens pipeline reads (mock → library drift direction, D29); the linked
  sheet is byte-identical to them, so cascade order changes nothing.
  ``panel-layout.css`` now also carries the J7 reduced-motion block
  (behavior.spec.md §3 J7), extracted from the mock.
- Single-instance parity test: the mock-facing bundle's externals assert
  (metafile) already cover the engine-copy guarantee; a page-level
  resource-count spec remains follow-up work with the twin target.

Deferred items that LANDED with the demo task (D38/D39):

- Demo surface extraction: DONE — ``@metanorma/panel-layout/demo``
  (``demo/index.ts``, exports-map subpath) carries the 11 panel bodies,
  the registry (doc policy key per D33), the preset, the two-key storage
  config, the toolbar/statusbar chrome and ``DemoApp``; it consumes only
  the public API plus the react peer. The demo stylesheet is
  ``demo/panel-content.css`` (byte-identical migration of the mock's
  panel-content CSS region); the mock links it relatively
  (``../demo/panel-content.css`` — parity server, goldens server and
  file:// all resolve it). App-chrome CSS stays inline in the mock by
  design (D35); where it lives for a host other than the mock is the twin
  loop's decision.
- Mock thinning: DONE — the mock keeps zero demo content, zero chrome
  JSX and zero registrations inline; its remainder is boot/head, the
  extraction-anchor CSS + design-token blocks, and one two-import mount
  of ``DemoApp``. The parity suite passes UNCHANGED against the same
  goldens through the extracted demo.

Still deferred by design (twin loop, not this one):

- Twin assembly + first twin parity run (D2/D38): the twin harness page
  consuming ``DemoApp`` (and the twin flavor demo artifact above), plus
  the decision of where the demo's app-chrome CSS lives outside the mock.
- Synthetic-suite audit beyond the convergence rows (D2).
- Regenerating the state frames from the thinned mock
  (``capture:states``) needs the demo stylesheet reachable from that
  tool's server root (it serves the mock from ``mock/`` today); until
  then the existing checked-in frames remain the verification source.
