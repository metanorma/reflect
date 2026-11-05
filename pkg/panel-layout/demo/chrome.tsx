/**
 * Demo app chrome — the toolbar and statusbar the demo consumer
 * contributes around the library's layout surface (demo.spec.md §4
 * "App chrome"; api.spec.md §2.1 "No toolbar/statusbar slots"). Translated
 * VERBATIM from the reference mock's `App()` JSX (mock :779–795 toolbar,
 * :829–835 statusbar): same classes (`.toolbar`/`.tb-btn`/`.on`/`.tb-sep`/
 * `.tb-spacer`/`.statusbar`/`.dot`/`.grow`/`.live`), same texts, same
 * `title` attribute on the auto-wrap toggle. The parity drivers key on
 * these (flows.mjs `autoWrapState` reads `.toolbar .tb-btn` + the
 * 'Auto-wrap panels:' label prefix + the `.on` class; the mock spec clicks
 * the 'Reset' button by role), and the pixel snapshots pin the rendering —
 * do not restyle.
 *
 * `createElement`-only (no JSX syntax): the repo's import scanner rejects
 * `/` after `}` (self-closing JSX with a trailing spread breaks the
 * char-consumption scan — D34), matching the mock's own `h()` style.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import { createElement as h } from 'react';
import type { FC } from 'react';

export interface DemoToolbarProps {
  /** Auto-wrap toggle state (library `autoWrap`; behavior.spec HP7/F1). */
  readonly autoWrap: boolean;
  /** Toggle handler (the demo flips its own state prop). */
  readonly onToggleAutoWrap: () => void;
  /** Restore-to-default handler (HP9; DemoApp's reset). */
  readonly onReset: () => void;
}

/** The demo toolbar (demo.spec §4: Bold · Italic | Quote · Note | Xref · Eref | spacer | Auto-wrap panels | Reset). */
export const DemoToolbar: FC<DemoToolbarProps> = ({
  autoWrap,
  onToggleAutoWrap,
  onReset,
}) => h('div', { className: 'toolbar' },
  h('button', { className: 'tb-btn' }, 'Bold'),
  h('button', { className: 'tb-btn' }, 'Italic'),
  h('span', { className: 'tb-sep' }),
  h('button', { className: 'tb-btn' }, 'Quote'),
  h('button', { className: 'tb-btn' }, 'Note'),
  h('span', { className: 'tb-sep' }),
  h('button', { className: 'tb-btn' }, 'Xref'),
  h('button', { className: 'tb-btn' }, 'Eref'),
  h('span', { className: 'tb-spacer' }),
  h('button', {
    className: 'tb-btn' + (autoWrap ? ' on' : ''),
    onClick: onToggleAutoWrap,
    // F1n (demo.spec.md §2): the toggle's state used to be conveyed only
    // by class + label suffix; aria-pressed makes it a proper pressed
    // toggle for AT. Attribute-only — no text/class/DOM-structure change
    // (golden-safe by analysis; the pixel layer cannot see it).
    'aria-pressed': autoWrap,
    title: 'When ON, dropping a dragged panel tab on empty space pops it into a new floating window (the Document tab itself stays docked)',
  }, 'Auto-wrap panels: ' + (autoWrap ? 'ON' : 'OFF')),
  h('button', { className: 'tb-btn', onClick: onReset }, 'Reset'));

/** The statusbar's `.live` hint, up to the save-state tail (demo.spec §4). */
export const LIVE_HINT_BASE
  = 'dockview v7 · drag tabs between windows · drop a tab on empty space = new window · drag empty tab-strip space to move a whole stack · ';
/** The default tail — the save claim (byte-pinned by the goldens' pixels). */
export const LIVE_HINT_SAVED = LIVE_HINT_BASE + 'layout saved';
/**
 * The C2 tail (behavior.spec.md §3 C2: under storage failure the 'layout
 * saved' claim is false — the demo swaps it; the library signals
 * `storage-unavailable` once per session on first write failure).
 */
export const LIVE_HINT_STORAGE_UNAVAILABLE
  = LIVE_HINT_BASE + 'layout NOT saved — storage unavailable';

export interface DemoStatusbarProps {
  /** C2: latch from `onDidFallback` reason 'storage-unavailable'. */
  readonly storageUnavailable?: boolean;
}

/** The demo statusbar (status dot + text | grow | .live hint | word count/saved line). */
export const DemoStatusbar: FC<DemoStatusbarProps> = ({ storageUnavailable }) =>
  h('div', { className: 'statusbar' },
    h('span', null, h('span', { className: 'dot' }),
      'Semantic XML valid · 1 unresolved reference · 1 duplicate docid'),
    h('span', { className: 'grow' }),
    h('span', { className: 'live' },
      storageUnavailable ? LIVE_HINT_STORAGE_UNAVAILABLE : LIVE_HINT_SAVED),
    h('span', null, '1 412 words · saved 12:04'));
