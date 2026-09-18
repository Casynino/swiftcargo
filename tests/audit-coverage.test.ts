import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

/**
 * EVERY ACT THAT CHANGES A RECORD LEAVES A LINE BEHIND.
 *
 * Read off the source rather than run against a database, because the thing
 * worth catching is a new server action landing with no trail at all — and that
 * is a thing you notice by reading the file, not by remembering to write a
 * fixture for something nobody thought to test.
 *
 * It is deliberately crude: a write must mention `recordAudit` or
 * `recordFieldChange` somewhere in its body, or be named below with the reason
 * it is exempt. An action that writes the wrong summary still passes here; an
 * action that writes nothing cannot.
 */

const ACTIONS = join(process.cwd(), "lib/actions");

type Action = { file: string; name: string; body: string; aliases: Set<string> };

function serverActions(): Action[] {
  const found: Action[] = [];
  for (const file of readdirSync(ACTIONS).filter((f) => f.endsWith(".ts")).sort()) {
    const src = readFileSync(join(ACTIONS, file), "utf8");
    if (!src.includes('"use server"')) continue;
    /* `import { correctExpense as correctExpenseIn }` — the helper is the same
       helper under another name, and the call site only ever says the alias. */
    const aliases = new Map<string, string>();
    for (const m of src.matchAll(/(\w+)\s+as\s+(\w+)/g)) aliases.set(m[2], m[1]);
    for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) {
      const start = m.index! + m[0].length;
      const next = src.indexOf("\nexport ", start);
      found.push({
        file,
        name: m[1],
        body: src.slice(start, next === -1 ? undefined : next),
        aliases: new Set(
          [...aliases].filter(([, real]) => HELPERS.has(real)).map(([alias]) => alias)
        ),
      });
    }
  }
  return found;
}

/**
 * Helpers in lib/ that write the line themselves.
 *
 * Several actions are thin: `updateCargoDetails` parses a form and hands the
 * work to lib/cargo-corrections.ts, which writes the FieldChange for each field
 * that moved and the audit row over the lot. Naming those helpers by hand would
 * rot, so they are found the same way the actions are — an exported function
 * whose body records something is a function an action may delegate to.
 */
function recordingHelpers(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "actions") walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const src = readFileSync(path, "utf8");
      if (!/recordAudit\(|recordFieldChange\(/.test(src)) continue;
      for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) {
        const start = m.index! + m[0].length;
        const next = src.indexOf("\nexport ", start);
        const body = src.slice(start, next === -1 ? undefined : next);
        if (/recordAudit\(|recordFieldChange\(/.test(body)) names.add(m[1]);
      }
    }
  };
  walk(join(process.cwd(), "lib"));
  return names;
}

const HELPERS = recordingHelpers();

/** Does this action record something, itself or through a helper that does? */
function leavesALine(action: Action): boolean {
  if (/recordAudit\(|recordFieldChange\(/.test(action.body)) return true;
  for (const helper of [...HELPERS, ...action.aliases]) {
    if (new RegExp(`\\b${helper}\\s*\\(`).test(action.body)) return true;
  }
  return false;
}

/** Writes nothing worth a line, or is covered by a helper that writes one. */
const NO_TRAIL_NEEDED: Record<string, string> = {
  "auth.ts:login": "reads a password; the session itself is the record",
  "auth.ts:logout": "ends a session",
  "clearance.ts:markCargoCleared": "lib/clearance.ts clearCargo writes a FieldChange and an AuditLog row per consignment it clears",
  "clearance.ts:markContainerCleared": "lib/clearance.ts clearCargo writes a FieldChange and an AuditLog row per consignment it clears",
  "boxes.ts:scanBoxAtDar": "every scan, whatever it found, is a ScanEvent row with the box, the person and the result",
  "boxes.ts:scanBoxForRelease": "every scan, whatever it found, is a ScanEvent row with the box, the person and the result",
  "cargo.ts:issueDeliveryNote": "the note is the record, and it is numbered",
  "claims.ts:verifyClaims": "delegates to the payment actions, which audit",
  "credit.ts:creditCandidates": "a read",
  "customers.ts:searchCustomers": "a read",
  "customers.ts:customerByPhone": "a read",
  "invoices.ts:confirmContainerPricing": "delegates to confirmPrices",
  "invoices.ts:saveInvoiceAdjustments": "each step it calls audits itself",
  "messages.ts:markConversationRead": "marks a staff inbox read",
  "messages.ts:markNotificationsRead": "marks the reader's own notifications read",
  "payable.ts:loadPayable": "a read",
  "payroll.ts:buildPayrollRun": "the run and its items are the record",
  "payroll.ts:updatePayrollItem": "the run and its items are the record",
  "payroll.ts:submitPayrollRun": "the run and its items are the record",
  "payroll.ts:decidePayrollRun": "the run and its items are the record",
  "payroll.ts:payPayrollRun": "the run and its items are the record",
  "payroll.ts:runPayrollNow": "the run and its items are the record",
  "price-list.ts:queryCountWithDar": "a read",
  "price-list.ts:confirmPrices": "delegates; each bill audits itself",
  "price-list.ts:setPriceListCargoType": "delegates to setWaitingCargoType",
  "price-list.ts:setPriceListRate": "delegates to setWaitingRate",
  "price-list.ts:savePriceListPrice": "delegates to setWaitingPrice",
  "profile.ts:updateMyProfile": "the signed-in user's own row",
  "profile.ts:changeMyPassword": "the signed-in user's own row",
  "register.ts:registerCustomer": "the customer row is the record",
  "estimate.ts:estimateFreight": "prices nothing and writes nothing; a read",
  "sourcing.ts:createSourcingRequest": "the request and its own history",
  "sourcing.ts:updateSourcingRequest": "writes FieldChange through a helper",
  "tickets.ts:createTicket": "the conversation and its messages are the record",
  "tickets.ts:updateTicket": "the conversation and its messages are the record",
  "messages.ts:startConversation": "the thread is the record",
  "messages.ts:customerReply": "the message is the record",
  "messages.ts:staffStartConversation": "the thread is the record",
  "messages.ts:replyToConversation": "the message is the record",
  "messages.ts:logCustomerContact": "the CustomerContact row is the record",
  "requests.ts:updateRequestStatus": "the request carries its own status",
  "containers.ts:advanceContainer": "writes a ContainerEvent and an audit row",
  "reconciliation.ts:checkAccount": "a read",
  "reconciliation.ts:reviewRecord": "the review row is the record",
  "reconciliation.ts:reviewRecords": "the review rows are the record",
  "expenses.ts:addExpenseReceipt": "the receipt is attached to an audited expense",
};

const actions = serverActions();

describe("nothing changes a record silently", () => {
  test("there are server actions to check at all", () => {
    assert.ok(actions.length > 100, `only found ${actions.length}`);
  });

  for (const action of actions) {
    const key = `${action.file}:${action.name}`;
    const exempt = NO_TRAIL_NEEDED[key];
    if (exempt) continue;
    test(`${key} writes a line`, () => {
      assert.ok(
        leavesALine(action),
        `${key} changes something and writes neither an AuditLog nor a FieldChange row. ` +
          `If it genuinely leaves its own record, name it in NO_TRAIL_NEEDED with the reason.`
      );
    });
  }

  test("the exemption list has no stale names", () => {
    /* An exemption for an action that no longer exists is a rule nobody is
       following any more, and the next one to carry that name inherits it. */
    const live = new Set(actions.map((a) => `${a.file}:${a.name}`));
    const stale = Object.keys(NO_TRAIL_NEEDED).filter((k) => !live.has(k));
    assert.deepEqual(stale, []);
  });
});

/**
 * The acts the owner listed, each pinned to the action that performs it.
 *
 * Separate from the sweep above because this list is the business's, not the
 * code's: it fails if somebody renames the action that records a release, and
 * it is where a new one gets added when the business grows a step.
 */
const OWNERS_LIST: [string, string, string][] = [
  ["cargo created at the counter", "cargo.ts", "receiveNewCargo"],
  ["cargo details corrected", "cargo.ts", "updateCargoDetails"],
  ["a package line added or changed", "cargo.ts", "upsertPackage"],
  ["a package line removed", "cargo.ts", "deletePackage"],
  ["received in China", "cargo.ts", "receiveInChina"],
  ["a container opened", "containers.ts", "createContainer"],
  ["cargo loaded", "containers.ts", "loadCargo"],
  ["cargo taken back off", "containers.ts", "unloadCargo"],
  ["the packing list issued", "containers.ts", "issuePackingList"],
  ["the box sealed", "containers.ts", "sealContainer"],
  ["the voyage recorded", "containers.ts", "updateVoyage"],
  ["sailed, landed and closed", "containers.ts", "advanceContainer"],
  ["received in Dar", "dar.ts", "receiveInDar"],
  ["the count signed off", "dar.ts", "verifyCargo"],
  ["a whole container signed off", "dar.ts", "verifyContainer"],
  ["ticked through as expected", "dar.ts", "acceptAsExpected"],
  ["reported missing", "dar.ts", "reportMissingAtDar"],
  ["reported damaged", "dar.ts", "reportDamageAtDar"],
  ["Dar's measurement corrected", "cargo.ts", "correctDarMeasurement"],
  ["a volume overridden", "cargo.ts", "overrideCbm"],
  ["cargo held and let go again", "cargo.ts", "setOperationalHold"],
  ["taken off a landed manifest", "containers.ts", "takeOffArrivedContainer"],
  ["put onto a landed manifest", "containers.ts", "putOnArrivedContainer"],
  ["a case opened", "exceptions.ts", "raiseException"],
  ["a case moved on", "exceptions.ts", "updateException"],
  ["a bill raised", "invoices.ts", "generateInvoice"],
  ["a bill issued", "invoices.ts", "issueInvoice"],
  ["a bill discounted", "invoices.ts", "discountInvoice"],
  ["a bill re-priced", "invoices.ts", "repriceInvoice"],
  ["a bill's rate changed", "invoices.ts", "changeInvoiceRate"],
  ["a bill cancelled", "invoices.ts", "cancelInvoice"],
  ["the rate book published to", "finance-config.ts", "createRate"],
  ["a rate edited", "finance-config.ts", "updateRate"],
  ["the board rate moved", "finance-config.ts", "setExchangeRate"],
  ["the company's settings changed", "finance-config.ts", "updateCompanySettings"],
  ["a payment claimed by a customer", "payments.ts", "submitCustomerPayment"],
  ["a payment recorded at the counter", "payments.ts", "recordPayment"],
  ["a payment verified", "payments.ts", "verifyPayment"],
  ["a payment sent back", "payments.ts", "rejectPayment"],
  ["a payment reversed", "payments.ts", "reversePayment"],
  ["a pickup note issued", "pickup-notes.ts", "issuePickupNote"],
  ["a pickup note withdrawn", "pickup-notes.ts", "cancelPickupNote"],
  ["cargo marked ready to collect", "release.ts", "markReadyForRelease"],
  ["cargo released", "release.ts", "releaseCargo"],
  ["a delivery asked for", "release.ts", "requestDelivery"],
  ["a delivery moved on", "release.ts", "updateDelivery"],
];

describe("the owner's list, each act to its action", () => {
  for (const [what, file, name] of OWNERS_LIST) {
    test(what, () => {
      const action = actions.find((a) => a.file === file && a.name === name);
      assert.ok(action, `${file}:${name} no longer exists — has it been renamed?`);
      assert.ok(
        leavesALine(action),
        `${file}:${name} does not write an AuditLog row`
      );
    });
  }
});

describe("an override keeps both values", () => {
  /* A field that moves without its old value beside it is a figure nobody can
     argue with afterwards. These are the ones that move money or measurements. */
  for (const [file, name] of [
    ["cargo.ts", "overrideCbm"],
    ["cargo.ts", "setOperationalHold"],
    ["cargo.ts", "correctDarMeasurement"],
    ["cargo.ts", "updateCargoDetails"],
    ["containers.ts", "takeOffArrivedContainer"],
    ["containers.ts", "putOnArrivedContainer"],
    ["invoices.ts", "changeInvoiceRate"],
    ["invoices.ts", "discountInvoice"],
  ] as [string, string][]) {
    test(`${file}:${name} writes a FieldChange`, () => {
      const action = actions.find((a) => a.file === file && a.name === name);
      assert.ok(action, `${file}:${name} no longer exists`);
      assert.ok(
        leavesALine(action),
        `${file}:${name} moves a field without recording what it was`
      );
    });
  }
});
