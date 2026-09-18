import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatTzPhone, normaliseTzPhone, tzPhoneProblem } from "@/lib/phone";

describe("one customer, one number", () => {
  test("every way a Tanzanian number is written is the same number", () => {
    for (const raw of ["+255712345678", "255712345678", "0712345678", "712345678", "+255 712 345 678", "0712-345-678", " (0712) 345678 "]) {
      assert.equal(normaliseTzPhone(raw), "+255712345678", raw);
    }
    assert.equal(normaliseTzPhone("0654123456"), "+255654123456");
  });

  test("anything else is refused, not guessed at", () => {
    for (const raw of ["+254712345678", "0812345678", "071234567", "07123456789", "+2557123", "hello", "", "0212345678"]) {
      assert.equal(normaliseTzPhone(raw), null, raw);
    }
    assert.match(tzPhoneProblem("+254712345678")!, /Tanzanian/);
    assert.match(tzPhoneProblem("")!, /required/);
    assert.equal(tzPhoneProblem("0712345678"), null);
  });

  test("read in groups of three", () => {
    assert.equal(formatTzPhone("+255712345678"), "+255 712 345 678");
  });
});
