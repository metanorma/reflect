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
  surface), every peer dependency EXTERNAL (``react``, ``react-dom``,
  ``dockview-react`` and their subpaths — wildcards, so the
  ``react/jsx-runtime`` specifier that automatic JSX emits stays
  external too). It proves peer semantics: the package works when the
  consumer supplies the engine. Served at
  ``http://127.0.0.1:4173/dist/mock/panel-layout.js`` by the parity
  server. The build asserts (from the esbuild metafile) that the
  dockview/dockview-core packages appear nowhere in the module graph —
  runtime engine imports from the library would load a second
  dockview-core instance next to the one inlined in the mock's bundled
  ``dockview-react`` (broken drag-and-drop); the source-level twin of
  this check is ``scripts/check-imports.mjs`` (``yarn imports:check``).

``twin/panel-layout.js``
  The TWIN-FACING artifact: entry ``index.ts`` (the public surface),
  nothing external — the engine is bundled from the yarn-installed
  exact 7.0.4 pins. It proves version truth with what the product will
  get. It is a TEST ARTIFACT, not a ship format: the package ships
  source/peer per its exports map. Duplicate-instance protection is
  yarn's own gate (``yarn check-for-multiple-instances``).

Deferred by design (they land with the PanelLayout component and the
mock rewiring, not with this build groundwork):

- Mock rewiring: the reference mock currently runs its inline port of
  the behavior code; the rewiring imports
  ``/dist/mock/panel-layout.js`` instead and drops the inline
  duplicates.
- CSS de-duplication: the mock carries the extracted rules inline in
  its ``<style>``; the target end-state is that it links the served
  ``panel-layout.css`` instead. Drift direction stays mock → library
  (``extract-css.mjs`` remains the generator).
- Single-instance parity test: once the mock imports the built
  artifact, a spec asserting that
  ``performance.getEntriesByType('resource')`` contains exactly one
  build URL per engine package becomes testable; it lands with the
  rewiring.
