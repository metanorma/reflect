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

Still deferred by design (twin loop, not this one):

- Twin assembly + first twin parity run (D2): ``dist/twin/panel-layout.js``
  bundles the engine from the yarn pins; no page consumes it yet.
- Synthetic-suite audit beyond the convergence rows (D2).
