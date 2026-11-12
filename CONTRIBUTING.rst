Contributing
============

Where conventions live
~~~~~~~~~~~~~~~~~~~~~~

Rules are split by what they govern:

- **Code** — ``pkg/**``, build scripts, dependencies, TypeScript and
  style — is governed by this file, ending with the `Verification`_
  commands.
- **The specification corpus** — ``docs/**/*.md`` and
  ``pkg/*/README.spec.md`` — is governed by
  `docs/CONVENTIONS.md <docs/CONVENTIONS.md>`_: spec placement,
  cross-referencing, change tracking, markdown style, and the
  ``docs(<area>):`` commit convention for spec changes. Its index is
  `docs/README.md <docs/README.md>`_.

Code conventions
~~~~~~~~~~~~~~~~

Dependencies
^^^^^^^^^^^^

- Do not export something that does not need exporting.

- Do not add a dependency unless warranted.
  Inspect dependency’s dependency tree.
  The bigger the tree, the less desirable the dependency.
  Try to architect the feature in a way that doesn’t require that dependency.

- If you add or upgrade a dependency, run ``yarn`` and pay attention
  if it reports a duplicate instance error at the end.
  If there are duplicate instances, you need to eliminate them.
  They may cause subtle runtime bugs
  (and/or spurious typing errors, possibly).

  You can investigate duplicate virtual instances using the command
  ``yarn check-for-multiple-instances``
  together with ``yarn why [duplicate package name]``.

  Duplicates may be caused by dependency specification
  in one of the packages in this repository (e.g., some dependency
  resolves to another version by another workspace),
  or some downstream package’s own specification. The above commands
  make it possible to narrow down the cause.

Integration surfaces
^^^^^^^^^^^^^^^^^^^^

- When a feature builds on a library’s extension mechanism — ProseMirror
  plugins, decorations, node views, clipboard/DOM serializers, editor
  props — verify the mechanism against the version **installed in this
  repo** (the Yarn PnP zips under ``.yarn/cache``), not against upstream
  docs, examples, or memory. The installed version is the only one whose
  behaviour counts.

- Verify **every layer the feature touches**, not just the library called
  directly. Wrapper libraries carry their own pipelines:
  ``@handlewithcare/react-prosemirror``, for example, draws plugin
  decorations only through a ``props.decorations`` hook (a
  ``DecorationSet`` held in plugin state renders nothing) and wraps every
  native widget decoration in a ``<span>``, so a widget is never a direct
  child of its parent element — ``table:has(> colgroup)`` CSS and
  ``:scope >`` DOM queries silently match nothing.

- Verify the dispatch point in the installed dist at **design time** —
  before specifying a subclass, wrapper, hook, or any override of library
  behavior. Upstream docs and memory describe the public API, not the
  dispatch mechanics a design depends on: whether the method is a prototype
  method or a constructor-assigned own property determines who calls what
  and when, and an override of the wrong kind never runs
  (``MetanormaSchema`` assigns ``nodeFromJSON``/``markFromJSON`` as own
  arrow-function properties in its constructor — a prototype-method
  override of either would never execute). Record the verified dispatch
  fact in a code comment where it is relied upon.

- Record non-obvious behavior in a code comment
  where it was verified (package, file, what it does), so the assumption
  can be re-checked after dependency upgrades.

Types & schema
^^^^^^^^^^^^^^

- We try to make the most out of TypeScript while staying pragmatic
  and not going overboard type wrangling.

- Using ``any`` or ``unknown`` is almost never acceptable.
  For data constructed by the code directly at runtime, we make sure
  the interface or type is clearly defined somewhere.

- If constant type was defined and can obviously be inferred by TSC
  *and* by a human without explicit annotation, avoid manually annotating
  the constant.

- Use ``@ts-expect-error``, if necessary, but not the ignore directive.

- The import-lint scanner (``scripts/check-imports.mjs``) cannot see a
  ``/`` right after ``}``: avoid self-closing JSX immediately after a
  spread (``<X {...props} />`` written as ``<X {...props}/>``) — use
  ``createElement`` or restructure.

Style guidelines
^^^^^^^^^^^^^^^^

* JSDoc-style docstrings (excluding type annotations)

* Two blank lines between imports and code

* Two-space indentation

* 80-character line length limit should be observed when feasible & non-ugly

* Single quotes are used for identifier-like strings
  (e.g., some object key, style attribute,
  imported package identifier or path).

  Double quotes are used for human-visible text
  like log messages or user-visible text
  (some of which may be phased away in favour
  of string IDs and translations supplied by separate files).

* Do use trailing semicolons, commas

* Indent blocks in curly braces or parentheses
  relative to the position of the opening brace/paren, e.g.::

      | {
          readonly kind: 'ok';
          readonly cutDepth: number;
          readonly reseed: boolean;
        };

  Invalid (do NOT format like this)::

      | {
        readonly kind: 'ok';
        readonly cutDepth: number;
        readonly reseed: boolean;
      };

* Split ternaries into lines like this::

      const a = b > c
        ? foo
        : bar;

* JSX:

  * Returning multi-line construct::

        return (
          <div>
            foo bar
          </div>
        );

  * Ternaries::

        {i > 0
          ? <span className="mn-toolbar-divider" aria-hidden="true" />
          : null}

    * With multi-line contents::

          {i > 0
            ? (
                <span className="mn-toolbar-divider" aria-hidden="true">
                  Span content
                </span>
              )
            : null}

Verification
~~~~~~~~~~~~

What CI runs on every PR:
``yarn check-specs`` and ``yarn build-gui``.

.. note:: Workspace inventory can be obtained by listing ``pkg/``
          or via root ``package.json``;
          package names used in ``workspace <name>`` commands are in respective
          subpackages' ``package.json`` ``name`` fields.
          Not all packages have e2e and/or unit tests.

More specifically, check the following before submitting:

- Specs/docs (``docs/**/*.md``, ``pkg/*/README.spec.md``):
  ``yarn check-specs`` (CI-enforced on every PR). Before changing a
  spec that other docs link to, run ``yarn spec-impact <spec-path.md>``
  and review the listed dependents (``docs/CONVENTIONS.md`` §7).

- Root scripts (``scripts/*.mjs``): ``yarn test:scripts`` runs their
  ``node:test`` suites (CI-enforced on every PR — zero-dep, no install
  needed).

- Upstream pin table (``docs/metanorma-model.md`` §1): ``yarn check-pins``
  is the offline lint — the table must parse and stay consistent with the
  watch map in ``scripts/check-pins.mjs`` (CI-enforced). ``node
  scripts/check-pins.mjs drift`` is the network check the scheduled
  ``drift-check`` workflow runs; dry-run it with ``--only org/repo``,
  ``--base org/repo=ref``, ``--head org/repo=ref`` or ``--table <path>``
  (env form ``CHECK_PINS_BASE_OVERRIDE``). Re-verification of ledger
  facts is the checklist embedded in each ``drift``-labelled tracking
  issue (see the README's "Upstream drift detection"): red between
  metanorma-standoc releases is the expected steady state — the fast path
  for verified no-semantic-change drift is re-pin + Re-verified date bump
  in the ledger, in one commit. A spec change that adds or extends a
  **model area** must add/extend the ledger row and watch-map entry in
  the same PR — the drift oracle only watches what the ledger pins.
  GitHub disables scheduled workflows after 60 days of repo inactivity —
  if drift alerts stop, dispatch the workflow manually.

- Dependency graph: run ``yarn`` and check for the
  duplicate-instance error at the end (see the dependency policy above),
  then ``yarn check-for-multiple-instances`` (narrow it down with
  ``yarn why <pkg>``) and ``yarn constraints`` (dependency ranges
  consistent across workspaces; note it currently fails at baseline on
  a pre-existing ``prosemirror-model`` range conflict, unrelated to
  new work).

- Any code under ``pkg/``: ``yarn workspace <name> compile``
  type-checks and emits for one workspace;
  ``yarn workspaces foreach -A run compile`` compiles all of them.

- Unit tests: ``yarn test`` runs every workspace's ``test`` script.

- When unit-testing library-mediated serialization (``toJSON``, DOM
  serializers), assert against observed behavior: prefer key-order-
  insensitive deep equality on parsed output, or verify the serialization
  facts (key presence/order, omitted-empty fields) first. But when the
  serialization shape is itself the contract — in-repo:
  ``pkg/prosemirror-schema/tableWidths.ts`` string stability,
  ``roundtrip.test.mjs`` exact-shape assertions — pin it explicitly with
  stringify equality.

- Browser e2e (not CI-enforced): ``yarn workspace editor-gui e2e``,
  ``yarn workspace @metanorma/prosemirror-minimap e2e`` and
  ``yarn workspace @metanorma/panel-layout parity``. Each suite builds
  its own target via Playwright's ``webServer`` and serves it; the only
  prerequisite is the one-time browser install,
  ``yarn workspace <pkg> e2e:install`` (for panel-layout,
  ``parity:install``). editor-gui's default ``e2e`` runs the chromium
  project only; ``e2e:all`` adds the firefox project for cross-browser
  support (prerequisite ``e2e:install-all``).

- DOM-rendering plugins (widgets, node views, decorations): wire the
  plugin into the GUI app and extend
  ``pkg/editor-gui/e2e/plugin-smoke.spec.ts`` in the same change. The
  smoke asserts rendering only (widget presence, placement, layout
  effects) — interaction-level e2e does not substitute for it.
