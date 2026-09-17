import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { backLabel, isDetailPath, previousFrom, readTrail, rememberTitle, visit } from "@/lib/nav-trail";

/* The trail lives in sessionStorage; a map stands in for it. */
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};

/** Walk the pages in order, then ask what Back on the last one names. */
function walk(...urls: string[]) {
  for (const url of urls) visit(url);
  const here = urls[urls.length - 1];
  return previousFrom(readTrail(), here);
}

describe("where Back goes", () => {
  beforeEach(() => store.clear());

  test("container, then a consignment on it, goes back to the container", () => {
    assert.equal(
      walk("/app/containers", "/app/containers/c1", "/app/cargo/g1"),
      "/app/containers/c1"
    );
  });

  test("an invoice opened from collections returns to the list with its query", () => {
    assert.equal(
      walk("/app/finance/collections?view=owing&sort=waiting&q=juma", "/app/finance/invoices/i1"),
      "/app/finance/collections?view=owing&sort=waiting&q=juma"
    );
  });

  test("customer, then their cargo, goes back to the customer", () => {
    assert.equal(
      walk("/app/customers?q=ali", "/app/customers/u1", "/app/cargo/g1"),
      "/app/customers/u1"
    );
  });

  test("walking back truncates rather than growing the trail", () => {
    walk("/app/containers", "/app/containers/c1", "/app/cargo/g1", "/app/containers/c1");
    assert.deepEqual(readTrail(), ["/app/containers", "/app/containers/c1"]);
  });

  test("opening a list starts a new piece of work", () => {
    assert.equal(walk("/app/containers/c1", "/app/cargo/g1", "/app/exceptions"), null);
  });

  test("a ledger entry is a record under the ledger, not a new list", () => {
    assert.equal(isDetailPath("/app/finance/ledger/e1"), true);
    assert.equal(walk("/app/finance/ledger?type=sale", "/app/finance/ledger/e1"), "/app/finance/ledger?type=sale");
  });

  test("a creation form is not offered as the way back from what it made", () => {
    assert.equal(walk("/app/customers", "/app/customers/new", "/app/customers/u9"), null);
    assert.equal(
      walk("/app/finance/payments/new", "/app/finance/payments/new/u1"),
      "/app/finance/payments/new"
    );
  });

  test("a record is named by the title it showed, a list by its own name", () => {
    rememberTitle("/app/containers/c1", "SWCU 123456-7");
    assert.equal(backLabel("/app/containers/c1"), "SWCU 123456-7");
    assert.equal(backLabel("/app/finance/collections?q=x"), "Payment follow-up");
    assert.equal(backLabel("/app/cargo/unknown"), "Back");
  });

  test("a stored value that is not one of our pages is ignored", () => {
    store.set("sc.nav.trail", JSON.stringify(["https://evil.example", "//evil", "/app/customers"]));
    assert.deepEqual(readTrail(), ["/app/customers"]);
  });
});
