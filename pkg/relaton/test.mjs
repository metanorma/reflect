/**
 * Headless tests for @metanorma/relaton (README.spec.md §6).
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

// --- entity helpers -------------------------------------------------------

/** Build an Organization object with all fields. */
function org(name, abbreviation = null, subdivision = []) {
  return { name, abbreviation, subdivision, identifier: [], contact: null, logo: null };
}

/** Build a Person object with all fields. */
function person(name, credential = []) {
  return { name, credential, affiliation: [], identifier: [], contact: null };
}

/** Build a role array from a single role type. */
function roles(type) {
  return [{ type, description: null, abbreviation: null }];
}

// --- fixtures -------------------------------------------------------------

function isoItem() {
  return {
    type: "standard",
    title: [{ type: "main", language: "en", script: "Latn", content: "Rice model" }],
    docid: [
      { type: "ISO", id: "ISO 17301-1:2021", primary: true, scope: null },
    ],
    contributor: [
      { role: roles("publisher"), entity: org("ISO", "ISO") },
    ],
    date: [{ type: "published", on: "2021", from: null, to: null, text: null }],
    status: { stage: { value: "60", abbreviation: null, name: null }, substage: { value: "00", abbreviation: null, name: null }, iteration: null },
    language: ["en"],
    script: ["Latn"],
    edition: "1",
    copyright: [{ from: "2021", to: null, owner: [org("ISO", "ISO")] }],
    abstract: null,
    uri: [],
    docnumber: null,
    version: null,
    classification: [],
    keyword: [],
    validity: null,
    license: [],
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

test("citeas — seeded primary in emptyBibliographicItem", () => {
  // emptyBibliographicItem now seeds a primary docid with empty id.
  assert.equal(citeas(emptyBibliographicItem()), "");
});

test("citeas — no docids (explicit empty)", () => {
  const item = { ...emptyBibliographicItem(), docid: [] };
  assert.equal(citeas(item), null);
});

// --- primaryDocid ----------------------------------------------------------

test("primaryDocid — returns explicit primary", () => {
  const result = primaryDocid(isoItem());
  assert.ok(result);
  assert.equal(result.id, "ISO 17301-1:2021");
});

test("primaryDocid — null when empty", () => {
  assert.equal(primaryDocid({ ...emptyBibliographicItem(), docid: [] }), null);
});

// --- mainTitle -------------------------------------------------------------

test("mainTitle — prefers type main", () => {
  const result = mainTitle(isoItem());
  assert.ok(result);
  assert.equal(result.content, "Rice model");
});

test("mainTitle — emptyBibliographicItem seeds a main title", () => {
  const result = mainTitle(emptyBibliographicItem());
  assert.ok(result);
  assert.equal(result.type, "main");
  assert.equal(result.content, "");
});

// --- formatContributor -----------------------------------------------------

test("formatContributor — person decomposed", () => {
  assert.equal(
    formatContributor({ role: roles("author"), entity: person({ completename: null, surname: "Doe", given: "John", prefix: null, formattedInitials: null, addition: [] }) }),
    "Doe, John",
  );
});

test("formatContributor — person completename", () => {
  assert.equal(
    formatContributor({ role: roles("author"), entity: person({ completename: "John Doe", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) }),
    "John Doe",
  );
});

test("formatContributor — organization", () => {
  assert.equal(
    formatContributor({ role: roles("publisher"), entity: org("ISO", "ISO") }),
    "ISO",
  );
});

test("formatContributor — person with prefix", () => {
  assert.equal(
    formatContributor({ role: roles("author"), entity: person({ completename: null, surname: "Smith", given: "John", prefix: "Dr", formattedInitials: null, addition: [] }) }),
    "Dr Smith, John",
  );
});

test("formatContributor — person with initials", () => {
  assert.equal(
    formatContributor({ role: roles("author"), entity: person({ completename: null, surname: "Smith", given: "John", prefix: null, formattedInitials: "R.", addition: [] }) }),
    "Smith, John R.",
  );
});

test("formatContributor — person with credential", () => {
  assert.equal(
    formatContributor({ role: roles("author"), entity: person({ completename: null, surname: "Smith", given: "John", prefix: null, formattedInitials: null, addition: [] }, ["PhD"]) }),
    "Smith, John, PhD",
  );
});

test("formatContributor — organization with subdivision", () => {
  assert.equal(
    formatContributor({ role: roles("publisher"), entity: org("ISO", "ISO", [org("TC 154")]) }),
    "ISO (TC 154)",
  );
});

// --- Multi-role contributor scenarios ---

test("primaryAuthor — contributor with author among multiple roles", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: roles("publisher"), entity: org("ISO", "ISO") },
      { role: [{ type: "author", description: null, abbreviation: null }, { type: "editor", description: null, abbreviation: null }], entity: person({ completename: "Dual Role", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) },
    ],
  };
  const result = primaryAuthor(item);
  assert.ok(result);
  assert.ok(result.role.some((r) => r.type === "author"));
  assert.equal(formatContributor(result), "Dual Role");
});

// --- Multi-contributor scenarios ---

test("primaryAuthor — returns first author among mixed roles", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: roles("publisher"), entity: org("ISO", "ISO") },
      { role: roles("editor"), entity: person({ completename: "Jane Editor", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) },
      { role: roles("author"), entity: person({ completename: "John Author", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) },
      { role: roles("author"), entity: person({ completename: "Second Author", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) },
    ],
  };
  const result = primaryAuthor(item);
  assert.ok(result);
  assert.ok(result.role.some((r) => r.type === "author"));
  // formatContributor should render the person's completename
  assert.equal(formatContributor(result), "John Author");
});

test("label — multiple contributors, no title/docid, uses first author", () => {
  const item = {
    ...emptyBibliographicItem(),
    docid: [],
    title: [],
    contributor: [
      { role: roles("publisher"), entity: org("ISO") },
      { role: roles("author"), entity: person({ completename: "Jane Smith", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) },
    ],
  };
  assert.equal(label(item), "Jane Smith");
});

test("label — multiple organizations only, uses first contributor", () => {
  const item = {
    ...emptyBibliographicItem(),
    docid: [],
    title: [],
    contributor: [
      { role: roles("publisher"), entity: org("International Organization for Standardization", "ISO") },
      { role: roles("sponsor"), entity: org("Another Org") },
    ],
  };
  assert.equal(label(item), "International Organization for Standardization");
});

// --- primaryAuthor ---------------------------------------------------------

test("primaryAuthor — finds author role", () => {
  const item = {
    ...emptyBibliographicItem(),
    contributor: [
      { role: roles("publisher"), entity: org("ISO") },
      { role: roles("author"), entity: person({ completename: "Jane Smith", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) },
    ],
  };
  const result = primaryAuthor(item);
  assert.ok(result);
  assert.ok(result.role.some((r) => r.type === "author"));
});

test("primaryAuthor — null when empty", () => {
  assert.equal(primaryAuthor({ ...emptyBibliographicItem(), contributor: [] }), null);
});

// --- label -----------------------------------------------------------------

test("label — docid + title", () => {
  assert.equal(label(isoItem()), "[ISO 17301-1:2021] Rice model");
});

test("label — title only (empty docid)", () => {
  const item = {
    ...emptyBibliographicItem(),
    docid: [],
    title: [{ type: "main", language: "en", script: null, content: "Hello World" }],
  };
  assert.equal(label(item), "Hello World");
});

test("label — author only", () => {
  const item = {
    ...emptyBibliographicItem(),
    docid: [],
    title: [],
    contributor: [{ role: roles("author"), entity: person({ completename: "Jane Smith", surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }) }],
  };
  assert.equal(label(item), "Jane Smith");
});

test("label — nothing", () => {
  assert.equal(label({ ...emptyBibliographicItem(), docid: [], title: [] }), "(untitled)");
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
