/**
 * React node view for the `bibdata` and `bibitem` atom nodes (§7.3).
 *
 * Both nodes store a `BibliographicItem` (from `@metanorma/relaton`) as a single
 * JSON `item` attr. This view renders a compact, non-editable summary and opens
 * a popover containing `<BibliographicItemForm>` on click. On popover Save, a
 * single `setNodeMarkup` transaction updates the node's `item` attr. On Cancel,
 * no transaction fires.
 *
 * The overlay is rendered via `createPortal` to `document.body`, placing it in
 * the browser's top layer — the same escape-overflow strategy the toolbar
 * popovers use (TableSizePicker, ImageInsertDialog). There are zero event
 * isolation concerns inside the contenteditable because the summary has no
 * editable fields — just a click target.
 *
 * `bibdata` renders as a **cover-page-style** summary (title, contributors,
 * docid, date, status) typeset like a traditional print publication's cover
 * page, but compact. `bibitem` renders as a single-line reference summary.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useEditorEventCallback,
  type NodeViewComponentProps,
} from "@handlewithcare/react-prosemirror";
import type { EditorView } from "prosemirror-view";

import { CLASS } from "@metanorma/prosemirror-schema";
import type { BibliographicItem } from "@metanorma/relaton";
import {
  citeas,
  mainTitle,
  primaryDocid,
  formatContributor,
  emptyBibliographicItem,
  BibliographicItemForm,
} from "@metanorma/relaton";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Extract the main title text from an item, or null. */
function titleText(item: BibliographicItem | null): string | null {
  if (item === null) return null;
  return mainTitle(item)?.content ?? null;
}

/** Format the date string for display (just the year or full date). */
function dateText(item: BibliographicItem | null): string | null {
  if (item === null) return null;
  const pub = item.date.find((d) => d.type === "published");
  if (pub === undefined) return null;
  return pub.text ?? pub.on ?? null;
}

/** Format the docid for display: type + id (e.g. "ISO 17301-1:2021"). */
function docidText(item: BibliographicItem | null): { type: string; id: string } | null {
  if (item === null) return null;
  const docid = primaryDocid(item);
  if (docid === null) return null;
  return { type: docid.type, id: docid.id };
}

/** Format the status stage for display. */
function statusText(item: BibliographicItem | null): string | null {
  if (item === null) return null;
  return item.status?.stage?.value ?? null;
}

/** Gather contributor display strings, grouped by role for the cover page. */
function contributorsByRole(item: BibliographicItem | null): { role: string; names: string[] }[] {
  if (item === null || item.contributor.length === 0) return [];
  const map = new Map<string, string[]>();
  for (const c of item.contributor) {
    const name = formatContributor(c);
    if (name === "") continue;
    for (const r of c.role) {
      const list = map.get(r.type);
      if (list !== undefined) {
        list.push(name);
      } else {
        map.set(r.type, [name]);
      }
    }
  }
  return [...map.entries()].map(([role, names]) => ({ role, names }));
}

/** Format the copyright line for display: "© 2021 ISO". */
function copyrightText(item: BibliographicItem | null): string | null {
  if (item === null) return null;
  const first = item.copyright.find((c) => c.from !== null && c.from !== "") ?? item.copyright[0];
  if (first === undefined) return null;
  const year = first.from ?? null;
  const owner = first.owner[0]?.name ?? null;
  if (year !== null && owner !== null && owner !== "") return `© ${year} ${owner}`;
  if (year !== null) return `© ${year}`;
  if (owner !== null && owner !== "") return `© ${owner}`;
  return null;
}

// ---------------------------------------------------------------------------
// Shared NodeView logic
// ---------------------------------------------------------------------------

/** Shared props for the summary rendering. */
interface BibNodeViewProps extends NodeViewComponentProps {
  /** The CSS class for the outer element (CLASS.bibdata or CLASS.bibitem). */
  readonly className: string;
  /** Whether to render the cover-page style (bibdata) or reference (bibitem). */
  readonly variant: "cover" | "reference";
}

function BibNodeViewInner({
  nodeProps,
  ref,
  className,
  variant,
  ...props
}: BibNodeViewProps): React.JSX.Element {
  const { node, getPos } = nodeProps;
  const item = (node.attrs["item"] as BibliographicItem | null) ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BibliographicItem>(
    item ?? emptyBibliographicItem(),
  );

  // Re-sync draft when the node's item changes externally (e.g. undo/redo).
  useEffect(() => {
    if (!open) {
      setDraft(item ?? emptyBibliographicItem());
    }
  }, [item, open]);

  const dispatchSave = useEditorEventCallback(
    (view: EditorView | null, nextItem: BibliographicItem) => {
      if (view === null) return;
      const pos = getPos();
      if (typeof pos !== "number") return;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        item: nextItem,
      });
      view.dispatch(tr);
    },
  );

  const handleSave = useCallback(() => {
    dispatchSave(draft);
    setOpen(false);
  }, [dispatchSave, draft]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setDraft(item ?? emptyBibliographicItem());
  }, [item]);

  const popoverTitle = variant === "cover" ? "Edit bibliographic data" : "Edit bibliography entry";

  return (
    <div ref={ref} {...props}>
      {variant === "cover" ? (
        <CoverPageSummary
          item={item}
          className={className}
          onOpen={() => setOpen(true)}
        />
      ) : (
        <ReferenceSummary
          item={item}
          className={className}
          onOpen={() => setOpen(true)}
        />
      )}

      {open &&
        createPortal(
          <BibItemPopover
            title={popoverTitle}
            draft={draft}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={handleCancel}
          />,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cover-page summary (bibdata)
// ---------------------------------------------------------------------------

const CoverPageSummary: React.FC<
  { item: BibliographicItem | null; className: string; onOpen: () => void }
> = function CoverPageSummary({ item, className, onOpen }) {
  const title = titleText(item);
  const id = docidText(item);
  const date = dateText(item);
  const status = statusText(item);
  const groups = contributorsByRole(item);
  const uris = item !== null ? (item.uri ?? []).filter((u) => u.content !== "") : [];
  const copy = copyrightText(item);
  return (
    <div
      className={`${className} mn-bib-cover`}
      contentEditable={false}
      suppressContentEditableWarning
      role="button"
      tabIndex={0}
      title="Click to edit bibliographic data"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {title !== null ? (
        <div className="mn-bib-cover__title">{title}</div>
      ) : (
        <div className="mn-bib-cover__title mn-bib-cover__title--empty">
          Untitled document — click to edit
        </div>
      )}

      {(groups.length > 0 || id !== null || date !== null || status !== null) && (
        <div className="mn-bib-cover__meta">
          {groups.map((g) => (
            <div key={g.role} className="mn-bib-cover__contributor-group">
              <span className="mn-bib-cover__contributor-role">{g.role}</span>
              <span className="mn-bib-cover__contributor-names">
                {g.names.join(", ")}
              </span>
            </div>
          ))}
          {(id !== null || date !== null || status !== null) && (
            <div className="mn-bib-cover__ids">
              {id !== null && (
                <span className="mn-bib-cover__id">
                  <span className="mn-bib-cover__id-type">{id.type}</span>
                  {"\u00a0"}
                  {id.id}
                </span>
              )}
              {date !== null && <span className="mn-bib-cover__date">{date}</span>}
              {status !== null && <span className="mn-bib-cover__status">stage {status}</span>}
            </div>
          )}
          {uris.length > 0 && (
            <div className="mn-bib-cover__uris">
              {uris.map((u, i) => (
                <span key={i} className="mn-bib-cover__uri">
                  {i > 0 && " · "}
                  <a href={u.content} target="_blank" rel="noopener noreferrer">{u.content}</a>
                </span>
              ))}
            </div>
          )}
          {copy !== null && (
            <div className="mn-bib-cover__copyright">{copy}</div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reference-style summary (bibitem) — renders all bibliographic fields
// ---------------------------------------------------------------------------

const ReferenceSummary: React.FC<
  { item: BibliographicItem | null; className: string; onOpen: () => void }
> = function ReferenceSummary({ item, className, onOpen }) {
  if (item === null) {
    return (
      <div
        className={className}
        contentEditable={false}
        suppressContentEditableWarning
        role="button"
        tabIndex={0}
        title="Click to edit bibliography entry"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <span className="mn-bib-ref__empty">Empty entry — click to edit</span>
      </div>
    );
  }

  const citeKey = citeas(item);
  const title = mainTitle(item)?.content ?? null;
  const id = primaryDocid(item);
  const idType = id?.type ?? null;
  const idValue = id?.id ?? null;
  const pub = item.date.find((d) => d.type === "published");
  const dateStr = pub?.text ?? pub?.on ?? null;
  const stage = item.status?.stage?.value ?? null;
  const uris = (item.uri ?? []).filter((u) => u.content !== "");

  // Separate contributors by role for display.
  const authors = item.contributor.filter((c) => c.role.some((r) => r.type === "author")).map(formatContributor).filter((n) => n !== "");
  const publishers = item.contributor.filter((c) => c.role.some((r) => r.type === "publisher")).map(formatContributor).filter((n) => n !== "");
  const otherContributors = item.contributor
    .filter((c) => !c.role.some((r) => r.type === "author" || r.type === "publisher"))
    .map(formatContributor)
    .filter((n) => n !== "");

  return (
    <div
      className={className}
      contentEditable={false}
      suppressContentEditableWarning
      role="button"
      tabIndex={0}
      title="Click to edit bibliography entry"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="mn-bib-ref">
        {citeKey !== null && (
          <span className="mn-bib-ref__cite">[{citeKey}]</span>
        )}
        {idValue !== null && (
          <span className="mn-bib-ref__id">
            {idType !== null && <span className="mn-bib-ref__id-type">{idType}{" "}</span>}
            {idValue}
          </span>
        )}
        {authors.length > 0 && (
          <span className="mn-bib-ref__authors">{authors.join(", ")}</span>
        )}
        {title !== null && (
          <em className="mn-bib-ref__title">{title}</em>
        )}
        {dateStr !== null && (
          <span className="mn-bib-ref__date">{dateStr}</span>
        )}
        {publishers.length > 0 && (
          <span className="mn-bib-ref__publisher">{publishers.join(", ")}</span>
        )}
        {otherContributors.length > 0 && (
          <span className="mn-bib-ref__other-contrib">
            {otherContributors.join("; ")}
          </span>
        )}
        {stage !== null && (
          <span className="mn-bib-ref__stage">stage {stage}</span>
        )}
        {uris.length > 0 && (
          <span className="mn-bib-ref__uris">
            {uris.map((u, i) => (
              <span key={i} className="mn-bib-ref__uri">
                {i > 0 && " "}
                <a href={u.content} target="_blank" rel="noopener noreferrer">{u.content}</a>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Centered modal overlay (shared)
// ---------------------------------------------------------------------------

/** The centered modal overlay with the form and Save/Cancel buttons. */
function BibItemPopover({
  title,
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  readonly title: string;
  readonly draft: BibliographicItem;
  readonly onChange: (next: BibliographicItem) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="mn-bib-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div ref={dialogRef} className="mn-bib-dialog">
        <div className="mn-bib-dialog__header">{title}</div>
        <BibliographicItemForm value={draft} onChange={onChange} />
        <div className="mn-bib-dialog__actions">
          <button type="button" className="mn-bib-dialog__btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="mn-bib-dialog__btn mn-bib-dialog__btn--primary"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Node view for the `bibdata` node (document-level metadata, cover-page style). */
export function BibdataNodeView(props: NodeViewComponentProps): React.JSX.Element {
  return <BibNodeViewInner {...props} className={CLASS.bibdata} variant="cover" />;
}

/** Node view for the `bibitem` node (bibliography entry, reference-style summary). */
export function BibitemNodeView(props: NodeViewComponentProps): React.JSX.Element {
  return <BibNodeViewInner {...props} className={CLASS.bibitem} variant="reference" />;
}
