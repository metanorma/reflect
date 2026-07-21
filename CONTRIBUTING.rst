Contributing
============

Style guidelines
----------------

* Two-space indentation

* 80-character line length limit

* Single quotes for identifier-like strings
  (imports, object keys, internal enum values, etc.),
  double quotes for displayed text-like strings
  (log messages, visible text)

* Trailing semicolons preferred

* Split ternaries into lines like this:

      const a = b > c
        ? foo
        : bar;

* JSX:

  * Returning multi-line construct:

        return (
          <div>
            foo bar
          </div>
        );

  * Ternaries:

        {i > 0
          ? <span className="mn-toolbar-divider" aria-hidden="true" />
          : null}

    * With multi-line contents:

          {i > 0
            ? (
                <span className="mn-toolbar-divider" aria-hidden="true">
                  Span content
                </span>
              )
            : null}
