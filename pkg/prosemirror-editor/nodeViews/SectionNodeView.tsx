/**
 * React node view for the ten content-bearing section node types (§7.3).
 *
 * Registered for: `clause`, `annex`, `content_section`, `abstract`, `foreword`,
 * `introduction`, `acknowledgements`, `terms`, `definitions`, `references`.
 * NOT registered for `floating_title` (it has its own view).
 *
 * Renders `<section class="mn-<type>" data-id={id}>` containing:
 *   1. an editable title strip `<div class="mn-section-title">` holding an
 *      `<input>` bound to `node.attrs.title` — editing the input dispatches
 *      `setNodeMarkup` to update the attribute **on blur** (not per keystroke;
 *      see §"Event isolation" and `SectionTitleInput` for why); and
 *   2. the section's editable content (`{children}`) inside a content-host
 *      element that receives `nodeProps.contentDOMRef`.
 *
 * **Event isolation.** The title `<input>` lives inside `view.dom` (the
 * `contenteditable` surface) but is NOT part of ProseMirror's document view
 * (it has no `pmViewDesc`). Without intervention, `beforeinput`/`keydown`/
 * `compositionstart`/`mousedown`/`paste` events from the `<input>` bubble to
 * `view.dom`, where prosemirror-view and `@handlewithcare/react-prosemirror`'s
 * `beforeInputPlugin` intercept them: `beforeinput` is `preventDefault()`ed
 * and the text is routed into the ProseMirror selection (the body), and
 * `keydown`/`mousedown` move the selection or trigger keymaps. React's
 * synthetic `onKeyDown`/`onMouseDown` (bubble phase) are too late — the
 * native listeners on `view.dom` fire first. The fix: capture-phase
 * `stopPropagation` listeners for every editor-relevant event type, attached
 * to the `<input>` element itself (the event target). On the target,
 * `stopPropagation` prevents the event from bubbling to `view.dom` while
 * the target's own listeners and native default actions (text insertion,
 * focus, IME) proceed unaffected. The `input` event is deliberately NOT
 * stopped — React's controlled-`<input>` `onChange` relies on it bubbling
 * to the React root.
 *
 * **Commit timing (focus retention).** The title is committed to the doc on
 * **blur**, not on every `onChange`. Dispatching a `setNodeMarkup` transaction
 * per keystroke triggers a controlled-mode re-render →
 * `ReactEditorView.commitPendingEffects()` → `super.update()` →
 * `selectionToDOM()`, which writes the ProseMirror selection back into the DOM
 * and steals focus from the `<input>`. Committing only on blur means no
 * transaction fires while the user is typing, so focus is retained across the
 * whole editing session. Local React state mirrors the value for
 * responsiveness; the node attr is synced once when the field loses focus.
 * Undo therefore walks back one title edit per blur, not per character — the
 * cleaner UX.
 *
 * Schema context: `sectionToDOM` (schema §8.2) is the headless / export
 * serialization path and deliberately does NOT render `title` (Metanorma
 * Presentation XML models a section heading as a `<title>`/`<name>` *child
 * element*, not an attribute — schema §17). This node view is an editor-only
 * rendering override that surfaces the typed `title` attribute as editable
 * text so the user can see and edit the heading they supplied via the
 * `wrapInClause` prompt. The attribute remains the source of truth.
 */

import React from "react";
import {
  useEditorEventCallback,
  useMergedDOMRefs,
  type NodeViewComponentProps,
} from "@handlewithcare/react-prosemirror";

/** Placeholder shown when `title` is null/empty. */
const TITLE_PLACEHOLDER = "Section heading";

/**
 * The DOM event types that prosemirror-view (`editHandlers`/`handlers`) and
 * `beforeInputPlugin` listen for on `view.dom` (bubble phase). Any of these
 * originating from the title `<input>` must be stopped before they reach
 * `view.dom`, otherwise the editor intercepts them (e.g. `beforeinput` is
 * `preventDefault`ed and the text is inserted into the body). `input` is
 * deliberately excluded — React's controlled-input onChange relies on it.
 */
const STOPPED_EVENT_TYPES: readonly string[] = [
  "beforeinput",
  "keydown",
  "keyup",
  "keypress",
  "mousedown",
  "mouseup",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "paste",
  "cut",
  "drop",
  "dragover",
  "dragenter",
] as const;

/**
 * Module-scope handler — stable reference so `addEventListener` deduplicates
 * if the ref callback runs more than once with the same element.
 */
function stopEventPropagation(event: Event): void {
  event.stopPropagation();
}

/**
 * Ref callback that attaches capture-phase `stopPropagation` listeners to the
 * title `<input>` element. Capture phase on the event target fires before the
 * event can bubble to `view.dom`, while the target's own native handling
 * (default actions, same-node listeners) proceeds unaffected.
 */
function attachEventIsolation(el: HTMLElement | null): void {
  if (el === null) return;
  for (const type of STOPPED_EVENT_TYPES) {
    el.addEventListener(type, stopEventPropagation, true);
  }
}

/**
 * Editable title for a section node. A controlled `<input>` bound to
 * `node.attrs.title`; commits to the doc on **blur**, not on every change.
 *
 * Commit-on-blur (rather than commit-on-change) is required because the
 * `setNodeMarkup` transaction triggers a controlled-mode re-render and
 * `ReactEditorView.commitPendingEffects()` → `super.update()` →
 * `selectionToDOM()`, which writes the ProseMirror selection back into the DOM
 * and thereby steals focus from the `<input>`. Dispatching per keystroke would
 * blur the field after every character. Committing only on blur means no
 * transaction fires during typing, so focus is retained. Local React state
 * keeps the input responsive while editing; the node attr is synced to the doc
 * when the user leaves the field.
 */
function SectionTitleInput({
  title,
  onCommit,
}: {
  readonly title: string;
  readonly onCommit: (next: string) => void;
}): React.JSX.Element {
  // Local state keeps the input responsive while the user types. The doc is
  // updated only on blur (below), so this local mirror is the source of truth
  // during editing.
  const [value, setValue] = React.useState(title);
  React.useEffect(() => {
    // Re-sync from the node when the node attr changes externally (undo/redo,
    // setSectionType, programmatic edits). Use a layout effect so the sync
    // happens before paint, avoiding a flicker of the stale value.
    setValue(title);
  }, [title]);

  return (
    <input
      ref={attachEventIsolation}
      className="mn-section-title-input"
      type="text"
      value={value}
      placeholder={TITLE_PLACEHOLDER}
      contentEditable={false}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      onBlur={(e) => {
        // Commit only when the edited value differs from the committed title,
        // so a no-op blur (click away without editing) does not dispatch.
        const next = e.target.value;
        if (next !== title) {
          onCommit(next);
        }
      }}
      aria-label="Section heading"
    />
  );
}

/**
 * Node view for the ten content-bearing section node types.
 *
 * `nodeProps.node` is the section node; `nodeProps.getPos()` is its position;
 * `nodeProps.contentDOMRef` must land on the element hosting `{children}`.
 */
export function SectionNodeView({
  nodeProps,
  children,
  ref,
  ...props
}: NodeViewComponentProps): React.JSX.Element {
  const { node, getPos, contentDOMRef } = nodeProps;
  const type = node.type.name;
  const id = node.attrs["id"] as string | null;
  const title = (node.attrs["title"] as string | null) ?? "";

  // Dispatch a `setNodeMarkup` updating only `title`, preserving the other
  // attrs (id, number, data). Captured in a stable callback via
  // useEditorEventCallback so the input does not need the view in scope.
  // Called on blur (not per keystroke) — see SectionTitleInput.
  const commitTitle = useEditorEventCallback((view, next: string) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const tr = view.state.tr.setNodeMarkup(
      pos,
      undefined,
      { ...node.attrs, title: next === "" ? null : next },
    );
    view.dispatch(tr);
  });

  // `ref` → outer <section>; `contentDOMRef` → content host. They are different
  // elements (the title strip sits between), so we cannot merge them onto one.
  const contentRef = useMergedDOMRefs(contentDOMRef);

  return (
    <section
      ref={ref}
      className={`mn-${type}`}
      {...(id != null ? { "data-id": id } : {})}
      {...props}
    >
      <div className="mn-section-title" contentEditable={false}>
        <SectionTitleInput title={title} onCommit={commitTitle} />
      </div>
      <div className="mn-section-content" ref={contentRef}>
        {children}
      </div>
    </section>
  );
}
