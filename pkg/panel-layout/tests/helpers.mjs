/**
 * Shared fakes for the headless tests (`tests/*.test.mjs`).
 *
 * Sized to the real module seams — each fake exposes exactly the accessors
 * the module under test touches and nothing more, so an implementation
 * change that needs a fourth accessor fails loudly here instead of passing
 * against invented state. DOM-coupled rows (getBoundingClientRect,
 * requestAnimationFrame, elementFromPoint) are never faked in Node: they
 * belong to the synthetic Playwright layer (covered by parity until it
 * lands). Principle: a faked getBoundingClientRect tests the fake.
 */

/** In-memory LayoutStorage (persistence.ts seam). */
export class MapStorage {
  constructor(seed = new Map()) {
    this.map = seed;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

/**
 * Minimal DockviewApi fake. `getGroup`/`getPanel` are REQUIRED by the veto
 * predicates' hops (unwrap.ts floatExclusionVeto → api.getGroup;
 * unwrapAtPointer → api.getPanel) — not optional extras.
 */
export function fakeApi({ groups = [], getGroup, getPanel } = {}) {
  return {
    groups,
    getGroup: getGroup ?? (() => undefined),
    getPanel: getPanel ?? (() => undefined),
  };
}

/**
 * Minimal DockviewGroupPanel fake for pinGroup: exposes exactly the three
 * seams pinGroup touches — .minimumHeight, .maximumHeight,
 * .api.setConstraints — and nothing more. If pinning work ever needs a
 * fourth accessor, these tests move to the synthetic layer; that discovery
 * is an escalation, not an extension of this fake.
 */
export function fakeGroup({ minimumHeight, maximumHeight, setConstraintsSpy } = {}) {
  const calls = [];
  const group = {
    id: "g-fake",
    minimumHeight,
    maximumHeight,
    api: {
      setConstraints(c) {
        calls.push(c);
        group.minimumHeight = c.minimumHeight;
        group.maximumHeight = c.maximumHeight;
        setConstraintsSpy?.(c);
      },
    },
  };
  group.setConstraintsCalls = calls;
  return group;
}

/**
 * Minimal drop-event fake for the veto predicates (DropEventLike seam):
 * getData() returns { panelId, groupId, viewId } per the drag payload.
 * Group drags carry panelId === null EXPLICITLY (dockview convention the
 * predicates encode: strict `d.panelId !== null` = panel drag; absent-key
 * undefined would defeat it) — so an unset panelId is emitted as null.
 */
export function fakeDropEvent({
  kind = "content",
  position = "center",
  panelId,
  groupId,
  viewId = "v-test",
  groupLocation = "floating",
} = {}) {
  const data = { panelId: panelId ?? null, groupId, viewId };
  return {
    kind,
    position,
    nativeEvent: null,
    group: {
      api: { location: { type: groupLocation } },
    },
    getData: () => data,
  };
}

/** Minimal UnwrapConfig fake (unwrap.ts seam). */
export function fakeConfig({
  autoWrap = true,
  floatExcludedPanelIds = new Set(),
  viewId = "v-test",
  layoutArea = null,
} = {}) {
  return {
    autoWrap: () => autoWrap,
    floatExcludedPanelIds: () => floatExcludedPanelIds,
    viewId: () => viewId,
    layoutArea: () => layoutArea,
  };
}
