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

More specifically, check the following before submitting:

- Specs/docs (``docs/**/*.md``, ``pkg/*/README.spec.md``):
  ``yarn check-specs`` (CI-enforced on every PR). Before changing a
  spec that other docs link to, run ``yarn spec-impact <spec-path.md>``
  and review the listed dependents (``docs/CONVENTIONS.md`` §7).

- Dependency graph: run ``yarn`` and check for the
  duplicate-instance error at the end (see the dependency policy above),
  then ``yarn check-for-multiple-instances`` (narrow it down with
  ``yarn why <pkg>``) and ``yarn constraints`` (dependency ranges
  consistent across workspaces; note it currently fails at baseline on
  a pre-existing ``prosemirror-model`` range conflict, unrelated to
  new work).

- Any code under ``pkg/``: ``yarn workspace <name> compile``
  type-checks and emits for one workspace (names below);
  ``yarn workspaces foreach -A run compile`` compiles all of them.

- Unit tests: ``yarn test`` runs every suite in one command.
  Three packages have unit tests today (``editor-commands``,
  ``prosemirror-minimap``, ``relaton``); the rest have none, so a green
  ``yarn test`` means those three suites passed.

- Browser e2e (not CI-enforced): ``yarn workspace editor-gui e2e``
  and ``yarn workspace @metanorma/prosemirror-minimap e2e``. Each suite
  builds its own target via Playwright's ``webServer`` and serves it;
  the only prerequisite is the one-time browser install,
  ``yarn workspace <pkg> e2e:install``.

- DOM-rendering plugins (widgets, node views, decorations): wire the
  plugin into the GUI app and extend
  ``pkg/editor-gui/e2e/plugin-smoke.spec.ts`` in the same change. The
  smoke asserts rendering only (widget presence, placement, layout
  effects) — interaction-level e2e does not substitute for it.

Workspace inventory (all under ``pkg/``; used by the
``yarn workspace <name>`` commands above):

- ``@metanorma/prosemirror-schema`` (``pkg/prosemirror-schema``) — no tests
- ``@metanorma/prosemirror-editor`` (``pkg/prosemirror-editor``) — no tests
- ``@metanorma/editor-commands`` (``pkg/editor-commands``) — unit tests
- ``@metanorma/toolbar`` (``pkg/toolbar``) — no tests
- ``@metanorma/relaton`` (``pkg/relaton``) — unit tests
- ``@metanorma/prosemirror-minimap``
  (``pkg/prosemirror-minimap``) — unit tests, e2e
- ``editor-gui`` (``pkg/editor-gui``) — e2e (incl. plugin rendering smoke)
