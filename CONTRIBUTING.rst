Contributing
============

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

Types & schema
^^^^^^^^^^^^^^

- We try to make the most out of TypeScript while staying pragmatic
  and not going overboard type wrangling.

- Using ``any`` or ``unknown`` is almost never acceptable.
  For data constructed by the code directly at runtime, we make sure
  the interface or type is clearly defined somewhere.

- For data that can arrive from an external source
  (including storage, such as JSON configuration, LocalStorage, IndexedDB),
  do not define or annotate types by hand.

  - Instead of defining types by hand, declare
    an `Effect schema <https://effect.website/docs/guides/schema/basic-usage>`_
    and derive the typings from that.

    - For consistently, the schema for a type ``Something`` must be called
      ``SomethingSchema``, and the following pattern is OK::

          import * as S from 'effect/Schema';

          export const SomethingSchema = S.Something({...});

          // If type needs to be manually annotated somewhere,
          // this can be defined:
          export type Something = S.Schema.Type<typeof SomethingSchema>;

  - Instead of using type guards and ad-hoc checking, or annotating types without
    actual validation, decode incoming structure with the schema
    (even with simple ``S.decodeUnkownSync()``) and handle parsing errors.

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
