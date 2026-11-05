/**
 * Headless tests for the pure backfill-decision helper
 * (`needsNaturalSizeBackfill`, MetanormaProseMirror.spec.md §6.3): the
 * data-URI-only scope rule and the only-if-null rule.
 *
 * The plugin itself draws nothing — its dispatch behavior is verified by the
 * editor-gui figures e2e, not here (plugin-smoke.spec.md scopes itself to
 * render verification).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { needsNaturalSizeBackfill } from "./compiled/plugins/imageNaturalSize.js";

const image = (attrs) => metanormaSchema.nodes["image"].create(attrs);
const DATA = "data:image/png;base64,AAA";
const URL_SRC = "https://example.org/cat.png";

describe("needsNaturalSizeBackfill (§6.3)", () => {
  it("true for a data-URI image with both attrs null (pasted / failed capture)", () => {
    assert.equal(
      needsNaturalSizeBackfill(image({ src: DATA, mimetype: "image/png" })),
      true,
    );
  });

  it("true when only one axis is null (partial state)", () => {
    assert.equal(
      needsNaturalSizeBackfill(
        image({ src: DATA, "x-natural-width": 3000, "x-natural-height": null }),
      ),
      true,
    );
  });

  it("false when both attrs are set — healthy docs dispatch nothing", () => {
    assert.equal(
      needsNaturalSizeBackfill(
        image({ src: DATA, "x-natural-width": 3000, "x-natural-height": 2000 }),
      ),
      false,
    );
  });

  it("false for remote-URL images — never backfilled, no network fetches", () => {
    assert.equal(
      needsNaturalSizeBackfill(image({ src: URL_SRC, mimetype: "image/png" })),
      false,
    );
    assert.equal(
      needsNaturalSizeBackfill(
        image({ src: URL_SRC, "x-natural-width": null, "x-natural-height": null }),
      ),
      false,
    );
  });

  it("false for empty src or non-image nodes", () => {
    assert.equal(needsNaturalSizeBackfill(image({ src: "" })), false);
    assert.equal(
      needsNaturalSizeBackfill(metanormaSchema.nodes["paragraph"].create()),
      false,
    );
  });
});
