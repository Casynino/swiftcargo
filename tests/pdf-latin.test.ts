import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { latin } from "@/lib/pdf-latin";

describe("latin", () => {
  test("keeps the Latin words and drops the Chinese beside them", () => {
    assert.equal(latin("auto parts 汽配"), "auto parts");
    assert.equal(latin("汽配 auto parts"), "auto parts");
    assert.equal(latin("shoes（男鞋）, 20 pcs"), "shoes, 20 pcs");
  });
  test("leaves ordinary text, accents and the usual punctuation alone", () => {
    assert.equal(latin("Café – 2 × 5 kg “new”"), "Café – 2 × 5 kg “new”");
    assert.equal(latin("Hati ya kupokea mzigo"), "Hati ya kupokea mzigo");
  });
  test("a line that was only Chinese prints as a dash, not as noise", () => {
    assert.equal(latin("汽配"), "—");
  });
});
