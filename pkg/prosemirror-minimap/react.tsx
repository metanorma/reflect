/**
 * `<Minimap>` — the React rendering component (§11).
 *
 * Renders the container + canvas + overlay, wires the `ResizeObserver`,
 * resolves the controller from `view` via `getMinimapController` (§7.1).
 * Placement is fully external: no opinion about flex order, side, or size
 * beyond filling its container.
 */

import React, { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

import { getMinimapController } from './plugin.js';
import { InlineRenderer } from './renderer.js';
import {
  CONTAINER_CLASS,
  CANVAS_CLASS,
  OVERLAY_CLASS,
} from './overlay.js';
import type { MinimapOptions, MinimapView } from './types.js';

import './minimap.css';


export interface MinimapProps {
  /** The editor view — the only integration point (§11). */
  view: MinimapView;
  /** Merged with the plugin's; the plugin wins (§11). */
  options?: MinimapOptions;
  /** Applied to the container (default `mn-minimap`). */
  className?: string;
  /** Consumer placement. */
  style?: CSSProperties;
  /** The controlled editor viewport's id — `aria-controls` (§9.1). */
  editorViewportId?: string;
}

export function Minimap({
  view,
  options,
  className,
  style,
  editorViewportId,
}: MinimapProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Component options merge into the plugin's own; the plugin wins (§11) —
  // `reconfigure` skips every key the plugin set itself.
  useEffect(() => {
    if (options === undefined) {
      return;
    }
    const controller = getMinimapController(view);
    controller?.reconfigure(options);
  }, [view, options]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (container === null || canvas === null || overlay === null) {
      return;
    }
    const controller = getMinimapController(view);
    if (controller === null) {
      // The plugin must be installed in the view — development warning
      // (§11), not a crash.
      console.warn(
        'No minimap controller for this view — install createMinimap() ' +
        'in the editor state plugins.',
      );
      return;
    }
    const renderer = new InlineRenderer();
    renderer.attach(canvas);
    controller.attachRenderer(
      renderer,
      overlay,
      {
        width: container.clientWidth,
        height: container.clientHeight,
        dpr: window.devicePixelRatio || 1,
      },
    );

    // Coalesced resize (§8.5): RO callbacks never resize synchronously —
    // the controller coalesces one per frame with floored device px.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        controller.onContainerResize(
          entry.contentRect.width,
          entry.contentRect.height,
        );
      }
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      controller.detachRenderer();
      renderer.destroy();
    };
  }, [view]);

  return (
    <div
      ref={containerRef}
      className={className ?? CONTAINER_CLASS}
      style={style}
    >
      <canvas ref={canvasRef} className={CANVAS_CLASS} aria-hidden="true" />
      <div
        ref={overlayRef}
        className={OVERLAY_CLASS}
        role="scrollbar"
        aria-orientation="vertical"
        aria-controls={editorViewportId}
        tabIndex={0}
        aria-valuenow={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Document position"
      />
    </div>
  );
}
