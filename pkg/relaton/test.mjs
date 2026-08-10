/**
 * Headless tests for @metanorma/relaton (Relaton.spec.md §7).
 *
 * Run: yarn workspace @metanorma/relaton test
 *
 * Uses Node's built-in `node:test` + `node:assert` — no test framework dep.
 * Pure JS (.mjs) so it runs directly under Node without a TypeScript loader.
 * Imports from ./compiled/ (run `yarn workspace @metanorma/relaton compile`
 * first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  citeas,
  label,
  primaryDocid,
  mainTitle,
  formatContributor,
  primaryAuthor,
} from "./compiled/helpers.js";
import { collectBibliographyItems } from "./compiled/collect.js";
import { emptyBibliographicItem } from "./compiled/types.js";

// --- helpers --------------------------------------------------------------

function isoItem() {
  return {
    type: "standard",
    title: [{ type: "main", language: "en", script: "Latn", content: "Rice model" }],
    docid: [
      { type: "ISO", id: "ISO 17301-1:2021", primary: true, scope: null },
    ],
    contributor: [
      { role: "publisher", entity: { name: "ISO", abbreviation: "ISO" } },
    ],
    date: [{ type: "published", on: "2021", from: null, to: null }],
    status: { stage: "60", substage: "00", iteration: null },
    language: ["en"],
    script: ["Latn"],
    edition: "1",
    copyright: { from: "2021", owner: { name: "ISO", abbreviation: "ISO" } },
    abstract: null,
  };
}

// --- citeas ----------------------------------------------------------------

test("citeas — explicit primary", () => {
  const item = {
    ...emptyBibliographicItem(),
    docid: [
      { type: "ISO", id: "secondary-id", primary: false, scope: null },
      { type: "URN", id: "urn:iso:std:iso:17301", primary: true, scope: null },
    ],
  };
  assert.equal(citeas(item), "urn:iso:std:iso:17301");
});

test("citeas — implicit primary (first docid)", () => {
  const item = {
    ...emptyBibliographicItem(),
    docid: [{ type: "ISO", id: "ISO 12345", primary: false, scope: null }],
  };
  assert.equal(citeas(item), "ISO 12345");
});

test("citeas — no docids", () => {
  assert.equal(citeas(emptyBibliographicItem()), null);
});

// --- primaryDocid ----------------------------------------------------------

test("primaryDocid — returns explicit primary", () => {
  const result = primaryDocid(isoItem());
  assert.ok(result);
  assert.equal(result.id, "ISO 17301-1:2021");
});

test("primaryDocid — null when empty", () => {
  assert.equal(primaryDocid(emptyBibliographicItem()), null);
});

// --- mainTitle -------------------------------------------------------------

test("mainTitle — prefers type main", () => {
  const result = mainTitle(isoItem());
  assert.ok(result);
  assert.equal(result.content, "Rice model");
});

test("mainTitle — null when empty", () => {
  assert.equal(mainTitle(emptyBibliographicItem()), null);
});

// --- formatContributor -----------------------------------------------------

test("formatContributor — person decomposed", () => {
  assert.equal(
    formatContributor({ role: "author", entity: { name: { completename: null, surname: "Doe", given: "John" } } }),
    "Doe, John",
  );
});

test("formatContributor — person completename", () => {
  assert.equal(
    formatContributor({ role: "author", entity: { name: { completename: "John Doe", surname: null, given: null } } }),
    "John Doe",
  );
});

test("formatContributor — organization", () => {
  assert.equal(
    formatContributor({ role: "publisher", entity: { name: "ISO", abbreviation: "ISO" } }),
    "ISO",
  );
});

// --- Multi-contributor scenarios ---

test("primaryAuthor — returns first author among mixed roles", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: "publisher", entity: { name: "ISO", abbreviation: "ISO" } },
      { role: "editor", entity: { name: { completename: "Jane Editor", surname: null, given: null } } },
      { role: "author", entity: { name: { completename: "John Author", surname: null, given: null } } },
      { role: "author", entity: { name: { completename: "Second Author", surname: null, given: null } } },
    ],
  };
  const result = primaryAuthor(item);
  assert.ok(result);
  assert.equal(result.role, "author");
  // formatContributor should render the person's completename
  assert.equal(formatContributor(result), "John Author");
});

test("label — multiple contributors, no title/docid, uses first author", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: "publisher", entity: { name: "ISO", abbreviation: null } },
      { role: "author", entity: { name: { completename: "Jane Smith", surname: null, given: null } } },
    ],
  };
  assert.equal(label(item), "Jane Smith");
});

test("label — multiple organizations only, uses first contributor", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: "publisher", entity: { name: "International Organization for Standardization", abbreviation: "ISO" } },
      { role: "sponsor", entity: { name: "Another Org", abbreviation: null } },
    ],
  };
  assert.equal(label(item), "International Organization for Standardization");
});

// --- primaryAuthor ---------------------------------------------------------

test("primaryAuthor — finds author role", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: "publisher", entity: { name: "ISO", abbreviation: null } },
      { role: "author", entity: { name: { completename: "Jane Smith", surname: null, given: null } } },
    ],
  };
  const result = primaryAuthor(item);
  assert.ok(result);
  assert.equal(result.role, "author");
});

test("primaryAuthor — null when empty", () => {
  assert.equal(primaryAuthor(emptyBibliographicItem()), null);
});

// --- label -----------------------------------------------------------------

test("label — docid + title", () => {
  assert.equal(label(isoItem()), "[ISO 17301-1:2021] Rice model");
});

test("label — title only", () => {
  const item = {
    ...emptyBibliographicItem(),
    title: [{ type: "main", language: "en", script: null, content: "Hello World" }],
  };
  assert.equal(label(item), "Hello World");
});

test("label — author only", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [{ role: "author", entity: { name: { completename: "Jane Smith", surname: null, given: null } } }],
  };
  assert.equal(label(item), "Jane Smith");
});

test("label — nothing", () => {
  assert.equal(label(emptyBibliographicItem()), "(untitled)");
});

// --- collectBibliographyItems ---------------------------------------------

test("collectBibliographyItems — full doc", () => {
  const doc = {
    type: "doc",
    attrs: {},
    content: [
      {
        type: "bibdata",
        attrs: { item: isoItem() },
      },
      {
        type: "sections",
        content: [
          {
            type: "references",
            attrs: { id: null, number: null, data: {} },
            content: [
              {
                type: "bibitem",
                attrs: {
                  item: {
                    ...emptyBibliographicItem(),
                    docid: [{ type: "RFC", id: "RFC 1234", primary: true, scope: null }],
                    title: [{ type: "main", language: null, script: null, content: "A Test RFC" }],
                  },
                },
              },
              {
                type: "bibitem",
                attrs: {
                  item: {
                    ...emptyBibliographicItem(),
                    docid: [{ type: "ISBN", id: "978-1234567890", primary: true, scope: null }],
                    title: [{ type: "main", language: null, script: null, content: "A Book" }],
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const items = collectBibliographyItems(doc);
  assert.equal(items.length, 3);
  // bibdata first
  assert.equal(citeas(items[0]), "ISO 17301-1:2021");
  assert.equal(citeas(items[1]), "RFC 1234");
  assert.equal(citeas(items[2]), "978-1234567890");
});

test("collectBibliographyItems — empty doc", () => {
  assert.deepEqual(collectBibliographyItems({ type: "doc", content: [] }), []);
});

test("collectBibliographyItems — non-node input", () => {
  assert.deepEqual(collectBibliographyItems(null), []);
  assert.deepEqual(collectBibliographyItems("string"), []);
  assert.deepEqual(collectBibliographyItems(42), []);
  assert.deepEqual(collectBibliographyItems([]), []);
  assert.deepEqual(collectBibliographyItems(undefined), []);
});

test("collectBibliographyItems — malformed item attr skipped", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "bibitem", attrs: { item: "not an object" } },
      { type: "bibitem", attrs: {} }, // missing item
      {
        type: "bibitem",
        attrs: {
          item: { title: "not an array", docid: [], contributor: [], date: [] }, // title not array
        },
      },
    ],
  };
  assert.deepEqual(collectBibliographyItems(doc), []);
});

test("collectBibliographyItems — bibdata only (no bibitems)", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "bibdata", attrs: { item: isoItem() } },
      { type: "sections", content: [] },
    ],
  };
  const items = collectBibliographyItems(doc);
  assert.equal(items.length, 1);
  assert.equal(citeas(items[0]), "ISO 17301-1:2021");
});
