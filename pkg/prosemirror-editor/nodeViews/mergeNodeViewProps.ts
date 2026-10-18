/**
 * `mergeNodeViewProps` — merge the library's forwarded props (selection
 * chrome, draggability) into a node view's own element props without
 * clobbering them (MetanormaProseMirror.spec.md §7).
 *
 * react-prosemirror re-renders a node view with `className:
 * "ProseMirror-selectednode"` as a PROP when the node is node-selected (and
 * sets `draggable`). React props replace rather than merge — a component that
 * spreads `{...props}` AFTER its own `className` gets its class clobbered on
 * selection, losing every style scoped to that class (for `figure.mn-figure`
 * that includes the whole document.css figure block and the
 * `:not(:has(img))` empty-figure placeholder). Atoms are hit by a plain
 * click; block views by triple-click / ctrl-click.
 *
 * The helper returns props safe to spread BEFORE nothing and AFTER nothing —
 * it simply pre-merges `className`, the only prop the library forwards that
 * collides with a hand-written class.
 */

import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

/**
 * Split forwarded props: pull `className` out and merge it with `own`, return
 * a spreadable rest. Use as:
 *
 * ```tsx
 * const { className, ...rest } = mergeNodeViewProps(props, CLASS.figure);
 * return <figure className={className} {...rest} />;
 * ```
 */
export function mergeNodeViewProps(
  props: Partial<NodeViewComponentProps>,
  ownClass: string,
): {
  className: string;
  rest: Record<string, unknown>;
} {
  const forwarded = (props as { className?: unknown }).className;
  const forwardedClass =
    typeof forwarded === "string" && forwarded !== "" ? forwarded : null;
  const className = forwardedClass !== null
    ? `${ownClass} ${forwardedClass}`
    : ownClass;
  const { className: _dropped, ...rest } = props as Record<string, unknown>;
  return { className, rest };
}
