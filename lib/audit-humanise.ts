import { formatCurrency, formatRate } from "@/lib/currency";
import { t, type Locale } from "@/lib/i18n";

/**
 * Turning a stored audit row back into a sentence somebody reads.
 *
 * An audit row is append-only: its `summary` was written at the moment the
 * thing happened and must never be rewritten, because the whole value of the
 * log is that nobody edits it afterwards. So the sentence on screen is not an
 * edit of the stored text. It is the same event, said again from the parts the
 * row still carries — the action code, the references and figures inside the
 * summary, the metadata — plus the one thing a reader always asks next, which
 * consignment a bill belongs to.
 *
 * Anything not recognised falls through to the stored summary. A row we cannot
 * re-say is still a row that must be readable; a half-guessed sentence about
 * money moving is worse than the words it was written with.
 */

export type AuditRow = {
  action: string;
  summary: string;
  metadata?: unknown;
};

/**
 * What the page could look up about the record a row names. Read from the
 * record as it stands today, and used only to name it — never to restate a
 * figure, because the figure in the row is the one that was true then.
 */
export type AuditContext = {
  invoiceNumber?: string | null;
  cargoReference?: string | null;
  currency?: string | null;
  containerReference?: string | null;
};

const REF = String.raw`(\S+)`;
const NUM = String.raw`(−?\d+(?:\.\d+)?)`;

/**
 * Bare figures written as "TZS 1815220" read as a phone number. Only a figure
 * with no grouping yet is touched; one already formatted is left as it was.
 */
function groupMoney(text: string): string {
  return text.replace(
    /\b(TZS|USD) (−?\d+(?:\.\d+)?)(?![\d,])/g,
    (_, currency: string, value: string) => formatCurrency(value, currency)
  );
}

function money(value: string, currency: string | null | undefined) {
  return currency ? formatCurrency(value, currency) : value;
}

function plural(count: string | number, one: string, many: string) {
  return `${count} ${Number(count) === 1 ? one : many}`;
}

function record(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

/** "INV-2026-000016" becomes "INV-2026-000016 (SC0061)" the first time it appears. */
function withCargo(sentence: string, ctx: AuditContext | undefined): string {
  const invoice = ctx?.invoiceNumber;
  const cargo = ctx?.cargoReference;
  if (!invoice || !cargo || sentence.includes(cargo)) return sentence;
  const at = sentence.indexOf(invoice);
  if (at === -1) return sentence;
  const end = at + invoice.length;
  return `${sentence.slice(0, end)} (${cargo})${sentence.slice(end)}`;
}

function said(reason: string | undefined) {
  const r = reason?.trim();
  return r ? ` — ${r}` : "";
}

/**
 * What happened, in one sentence.
 *
 * Matched on the action first and the stored wording second: the action code
 * is the thing the writer chose deliberately, and the summary is only the
 * carrier of the names and numbers inside it.
 */
export function auditSentence(
  locale: Locale,
  entry: AuditRow,
  ctx?: AuditContext
): string {
  const s = entry.summary;
  const meta = record(entry.metadata);
  const m = (pattern: string) => new RegExp(`^${pattern}$`, "s").exec(s);
  let parts: RegExpExecArray | null;

  switch (entry.action) {
    case "cargo.release": {
      parts = m(`Released ${REF} as ${REF} to (.+?) \\((\\d+) package\\(s\\)\\)`);
      if (parts) {
        const [, cargo, release, name, count] = parts;
        return `${t(locale, "Released")} ${cargo} ${t(locale, "to")} ${name} — ${plural(count, t(locale, "package"), t(locale, "packages"))}, ${release}`;
      }
      break;
    }

    case "pickupNote.issue": {
      parts = m(`Released ${REF} ON CREDIT as ${REF} — (.+?) still owes (\\w+) ${NUM}: (.*)`);
      if (parts) {
        const [, cargo, note, name, currency, owed, reason] = parts;
        return `${t(locale, "Let")} ${cargo} ${t(locale, "go on credit to")} ${name} ${t(locale, "with")} ${note}, ${formatCurrency(owed, currency)} ${t(locale, "still owed")}${said(reason)}`;
      }
      parts = m(`Issued ${REF} for ${REF} — (.+)`);
      if (parts) {
        const [, note, cargo, name] = parts;
        return `${t(locale, "Issued pickup note")} ${note} ${t(locale, "for")} ${cargo} ${t(locale, "to")} ${name}`;
      }
      break;
    }

    case "pickupNote.cancel": {
      parts = m(`Withdrew ${REF}: (.*)`);
      if (parts) return `${t(locale, "Withdrew pickup note")} ${parts[1]}${said(parts[2])}`;
      break;
    }

    case "invoice.adjust": {
      parts = m(`${REF}: total ${NUM} → ${NUM} — (.*)`);
      if (parts) {
        const [, invoice, from, to, reason] = parts;
        return withCargo(
          `${t(locale, "Adjusted")} ${invoice} ${t(locale, "from")} ${money(from, ctx?.currency)} ${t(locale, "to")} ${money(to, ctx?.currency)}${said(reason)}`,
          ctx
        );
      }
      break;
    }

    case "invoice.create": {
      parts = m(`Raised ${REF} for ${REF} — (.+), total (\\w+) ${NUM}`);
      if (parts) {
        const [, invoice, cargo, explanation, currency, total] = parts;
        return `${t(locale, "Raised")} ${invoice} ${t(locale, "for")} ${cargo} — ${formatCurrency(total, currency)} (${explanation})`;
      }
      break;
    }

    case "invoice.bulk": {
      parts = m(`Raised (\\d+) draft invoice\\(s\\)(.*)`);
      if (parts) {
        const [, count, rest] = parts;
        const on = ctx?.containerReference ? ` ${t(locale, "on")} ${ctx.containerReference}` : "";
        return `${t(locale, "Raised")} ${plural(count, t(locale, "draft invoice"), t(locale, "draft invoices"))}${on}${rest}`;
      }
      break;
    }

    case "invoice.reprice": {
      parts = m(`Re-priced ${REF} at (\\w+) ${NUM}/CBM: (.*)`);
      if (parts) {
        const [, invoice, currency, rate, reason] = parts;
        return withCargo(
          `${t(locale, "Re-priced")} ${invoice} ${t(locale, "at")} ${formatCurrency(rate, currency)} ${t(locale, "per CBM")}${said(reason)}`,
          ctx
        );
      }
      break;
    }

    case "invoice.discount": {
      parts = m(`Took (\\w+) ${NUM} off ${REF}: (.*)`);
      if (parts) {
        const [, currency, off, invoice, reason] = parts;
        return withCargo(
          `${t(locale, "Took")} ${formatCurrency(off, currency)} ${t(locale, "off")} ${invoice}${said(reason)}`,
          ctx
        );
      }
      break;
    }

    case "invoice.rate": {
      parts = m(`${REF}: (.+?) → (.+?)(?: — (.*))?`);
      if (parts) {
        const [, invoice, from, to, note] = parts;
        return withCargo(
          `${t(locale, "Changed the rate on")} ${invoice} ${t(locale, "from")} ${from} ${t(locale, "to")} ${to}${said(note)}`,
          ctx
        );
      }
      break;
    }

    case "payment.record": {
      parts = m(`Recorded ${REF}: (.+?) \\((.+?) at (.+?)\\) against ${REF} — awaiting verification`);
      if (parts) {
        const [, payment, amount, tzs, rate, invoice] = parts;
        // Shillings first: balances are kept in shillings, so that is the figure
        // the bill moves by. The currency handed over follows it.
        const figure = amount.startsWith("TZS") ? amount : `${tzs} (${amount} ${t(locale, "at")} ${rate})`;
        return withCargo(
          `${t(locale, "Recorded")} ${payment} — ${figure} ${t(locale, "against")} ${invoice}, ${t(locale, "awaiting verification")}`,
          ctx
        );
      }
      break;
    }

    case "payment.record.merged":
    case "payment.record.overpaid": {
      parts = m(`Took (\\w+) ${NUM} as one payment across (\\d+) bill\\(s\\): (.*)`);
      if (parts) {
        const [, currency, amount, count, bills] = parts;
        const payments = Array.isArray(meta.payments) ? meta.payments.map(String) : [];
        const account = typeof meta.account === "string" ? meta.account : null;
        const across =
          Number(count) === 1
            ? `${t(locale, "against")} ${bills}`
            : `${t(locale, "across")} ${plural(count, t(locale, "bill"), t(locale, "bills"))}: ${bills}`;
        const as = payments.length ? ` ${t(locale, "as")} ${payments.join(", ")}` : "";
        const into = account ? `, ${t(locale, "into")} ${account}` : "";
        const over =
          meta.overpaidBy != null
            ? ` — ${formatCurrency(String(meta.overpaidBy), currency)} ${t(locale, "more than owed")}${
                typeof meta.overpaymentReason === "string" ? `: ${meta.overpaymentReason}` : ""
              }`
            : "";
        return `${t(locale, "Took")} ${formatCurrency(amount, currency)} ${across}${as}${into}${over}`;
      }
      break;
    }

    case "payment.verify": {
      parts = m(`Verified ${REF} \\((.+?)\\) on ${REF}; receipt ${REF}, balance (.+)`);
      if (parts) {
        const [, payment, amount, invoice, receipt, balance] = parts;
        return withCargo(
          `${t(locale, "Verified")} ${payment} — ${amount} ${t(locale, "on")} ${invoice}; ${t(locale, "receipt")} ${receipt}, ${t(locale, "balance now")} ${balance}`,
          ctx
        );
      }
      break;
    }

    case "payment.reject": {
      parts = m(`Rejected ${REF} — (.*)`);
      if (parts) {
        const on = ctx?.invoiceNumber ? ` ${t(locale, "on")} ${ctx.invoiceNumber}` : "";
        return withCargo(`${t(locale, "Sent back")} ${parts[1]}${on}${said(parts[2])}`, ctx);
      }
      break;
    }

    case "payment.reverse": {
      parts = m(`Reversed ${REF} on ${REF} — (.*)`);
      if (parts) {
        return withCargo(
          `${t(locale, "Reversed")} ${parts[1]} ${t(locale, "on")} ${parts[2]}${said(parts[3])}`,
          ctx
        );
      }
      break;
    }

    case "payment.cancel": {
      parts = m(`Withdrew ${REF} \\(was (\\w+)\\)`);
      if (parts) {
        const on = ctx?.invoiceNumber ? ` ${t(locale, "on")} ${ctx.invoiceNumber}` : "";
        return withCargo(
          `${t(locale, "Withdrew the payment claim")} ${parts[1]}${on} — ${t(locale, "it was")} ${t(locale, parts[2])}`,
          ctx
        );
      }
      break;
    }

    case "payment.edit":
    case "payment.resubmit": {
      const on = ctx?.invoiceNumber && !s.includes(ctx.invoiceNumber) ? ` ${t(locale, "on")} ${ctx.invoiceNumber}` : "";
      return withCargo(`${groupMoney(s)}${on}`, ctx);
    }

    case "fx.set": {
      parts = m(`USD → TZS (?:${NUM} → )?${NUM} — (.*)`);
      if (parts) {
        const [, from, to, reason] = parts;
        const was = from ? ` (${t(locale, "was")} ${formatRate(from)})` : "";
        return `${t(locale, "Set the exchange rate to")} ${formatRate(to)}${was}${said(reason)}`;
      }
      break;
    }

    case "fx.delete": {
      parts = m(`Withdrew USD → TZS ${NUM}; ${NUM} is live again — (.*)`);
      if (parts) {
        const [, withdrawn, live, reason] = parts;
        return `${t(locale, "Withdrew the rate")} ${formatRate(withdrawn)}; ${formatRate(live)} ${t(locale, "is live again")}${said(reason)}`;
      }
      break;
    }

    case "expense.record": {
      parts = m(`Recorded (\\w+) ${NUM} (?:against ${REF}|as a (\\w+) cost)(?: at (.+))?`);
      if (parts) {
        const [, currency, amount, container, scope, rate] = parts;
        const what = container
          ? `${t(locale, "a cost against")} ${container}`
          : `${t(locale, scope === "office" ? "an office cost" : `a ${scope} cost`)}`;
        const at = rate && currency !== "TZS" ? ` ${t(locale, "at")} ${formatRate(rate)}` : "";
        return `${t(locale, "Recorded")} ${what} ${t(locale, "of")} ${formatCurrency(amount, currency)}${at}`;
      }
      break;
    }

    case "expense.cancel": {
      parts = m(`Cancelled ${REF} \\((\\w+) ${NUM}\\): (.*)`);
      if (parts) {
        const [, reference, currency, amount, reason] = parts;
        return `${t(locale, "Cancelled cost")} ${reference} (${formatCurrency(amount, currency)})${said(reason)}`;
      }
      break;
    }

    case "account.transfer": {
      parts = m(`${REF}: (\\w+) ${NUM} from (.+?) to (.+)`);
      if (parts) {
        const [, reference, currency, amount, from, to] = parts;
        return `${t(locale, "Moved")} ${formatCurrency(amount, currency)} ${t(locale, "from")} ${from} ${t(locale, "to")} ${to} (${reference})`;
      }
      break;
    }

    case "account.transfer.cancel": {
      parts = m(`Cancelled ${REF}: (.*)`);
      if (parts) return `${t(locale, "Cancelled transfer")} ${parts[1]}${said(parts[2])}`;
      break;
    }

    case "account.opening": {
      parts = m(`Opening balance of (.+) \\((\\w+)\\) set to ${NUM}`);
      if (parts) {
        const [, account, currency, amount] = parts;
        return `${t(locale, "Set the opening balance of")} ${account} ${t(locale, "to")} ${formatCurrency(amount, currency)}`;
      }
      break;
    }

    case "account.count": {
      parts = m(`(.+) counted (over|short) by ${NUM}`);
      if (parts) {
        const [, account, direction, by] = parts;
        return `${t(locale, "Counted")} ${account} — ${t(locale, direction)} ${t(locale, "by")} ${by}`;
      }
      parts = m(`(.+) counted and agreed`);
      if (parts) return `${t(locale, "Counted")} ${parts[1]} — ${t(locale, "it agrees")}`;
      break;
    }

    case "invoice.storage.charge": {
      parts = m(`Added (\\w+) ${NUM} storage to ${REF} \\((\\d+) day\\(s\\)\\)`);
      if (parts) {
        const [, currency, amount, invoice, days] = parts;
        return withCargo(
          `${t(locale, "Charged")} ${formatCurrency(amount, currency)} ${t(locale, "storage on")} ${invoice} ${t(locale, "for")} ${plural(days, t(locale, "day"), t(locale, "days"))}`,
          ctx
        );
      }
      break;
    }

    /* The settings line mixes figures from several fields in one sentence; it
       is shown as written rather than half-reformatted. */
    case "settings.update":
      return s;

    case "invoice.cancel":
    case "invoice.issue":
    case "invoice.storage.waive":
    case "invoice.charge":
    case "payment.writeoff":
    case "credit.request":
      return withCargo(groupMoney(s), ctx);
  }

  return groupMoney(s);
}

/**
 * What kind of event this was.
 *
 * The stored action is a code — `payment.reverse`, `pickupNote.cancel` — and a
 * code is not a language. The list shows the name of the event and keeps the
 * code on hover, where anyone who needs it to search is the person who knows it
 * exists. An action with no entry here shows its raw code rather than a guess.
 */
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",

  "cargo.create": "Cargo registered",
  "cargo.receive.china": "Received in China",
  "cargo.receive.intake": "Received at the counter",
  "cargo.receive.dar": "Received at Dar",
  "cargo.verify": "Cargo checked at Dar",
  "cargo.missing.dar": "Cargo missing at Dar",
  "cargo.release": "Cargo released",
  "cargo.hold": "Cargo held",
  "cargo.release_hold": "Hold lifted",
  "cargo.photo.upload": "Photos added",
  "cargo.label.print": "Labels printed",
  "cargo.package.delete": "Package line removed",
  "cargo.delete": "Cargo deleted",
  "cargo.restore": "Cargo restored",
  "cbm.override": "CBM corrected",
  "cargo.details.edit": "Cargo details edited",
  "cargo.measure.dar": "Dar count corrected",
  "deliveryNote.issue": "Delivery note issued",
  "delivery.update": "Delivery updated",

  "container.create": "Container opened",
  "container.load": "Cargo loaded",
  "container.unload": "Cargo taken off",
  "container.seal": "Container sealed",
  "container.departed": "Container departed",
  "container.in_transit": "Container at sea",
  "container.arrived": "Container arrived",
  "container.loaded": "Container loaded",
  "container.closed": "Container closed",
  "container.lcl_consolidated": "Container consolidated",
  "container.verify": "Container checked in",
  "container.pricing.confirm": "Container prices confirmed",
  "packingList.issue": "Packing list issued",
  "shipment.update": "Voyage updated",

  "invoice.create": "Invoice raised",
  "invoice.bulk": "Invoices raised",
  "invoice.issue": "Invoice issued",
  "invoice.adjust": "Invoice adjusted",
  "invoice.cancel": "Invoice cancelled",
  "invoice.discount": "Discount given",
  "invoice.reprice": "Invoice re-priced",
  "invoice.rate": "Invoice rate changed",
  "invoice.charge": "Charge added",
  "invoice.storage.charge": "Storage charged",
  "invoice.storage.waive": "Storage waived",
  "credit.request": "Credit requested",

  "payment.record": "Payment recorded",
  "payment.record.merged": "Payment taken",
  "payment.record.overpaid": "Payment taken, overpaid",
  "payment.verify": "Payment verified",
  "payment.reject": "Payment sent back",
  "payment.reverse": "Payment reversed",
  "payment.cancel": "Payment claim withdrawn",
  "payment.edit": "Payment claim corrected",
  "payment.resubmit": "Payment claim sent again",
  "payment.writeoff": "Shortfall written off",
  "pickupNote.issue": "Pickup note issued",
  "pickupNote.cancel": "Pickup note withdrawn",

  "expense.record": "Expense recorded",
  "expense.cancel": "Expense cancelled",
  "expense.correct": "Expense corrected",
  "expense.receipt.add": "Expense receipt added",
  "payment.correct": "Payment corrected",
  "payroll.build": "Salary run built",
  "payroll.updateItem": "Salary line edited",
  "payroll.submit": "Salary run sent for approval",
  "payroll.approve": "Salary run agreed",
  "payroll.reject": "Salary run sent back",
  "payroll.pay": "Salaries paid",
  "payroll.runNow": "Salary run built and paid in one action",
  "user.setSalary": "Salary set",
  "account.transfer": "Money moved between accounts",
  "account.transfer.cancel": "Transfer cancelled",
  "account.opening": "Opening balance set",
  "account.count": "Cash counted",
  "account.check": "Account checked",
  "account.collection.add": "Collection account added",
  "account.collection.edit": "Collection account edited",
  "account.collection.retire": "Collection account retired",
  "account.collection.reopen": "Collection account reopened",
  "review.queried": "Queried",
  "review.mismatch": "Marked a mismatch",
  "review.sent_back": "Sent back for review",
  "review.under_review": "Put under review",
  "review.reconciled": "Reconciled",

  "fx.set": "Exchange rate set",
  "fx.delete": "Exchange rate withdrawn",
  "rate.publish": "Rate published",
  "rate.edit": "Rate edited",
  "rate.delete": "Rate removed",
  "customerRate.set": "Customer rate agreed",
  "customerRate.edit": "Customer rate changed",
  "customerRate.delete": "Customer rate removed",
  "settings.update": "Company settings updated",

  "customer.create": "Customer added",
  "customer.register": "Customer signed up",
  "customer.update": "Customer edited",
  "customer.contact": "Customer contacted",
  "conversation.start": "Message sent",
  "ticket.create": "Support ticket opened",
  "ticket.update": "Support ticket updated",
  "sourcing.create": "Sourcing request opened",
  "sourcing.update": "Sourcing request updated",
  "exception.raise": "Exception raised",
  "exception.update": "Exception updated",

  "market.create": "Market added",
  "market.update": "Market updated",
  "market.publish": "Market published",
  "market.unpublish": "Market unpublished",
  "warehouse.create": "Warehouse added",
  "warehouse.update": "Warehouse updated",
  "schedule.create": "Sailing published",
  "schedule.update": "Sailing updated",
  "schedule.delete": "Sailing removed",

  "user.create": "Staff account created",
  "user.role": "Role changed",
  "user.status": "Account status changed",
  "user.changeRole": "Department changed",
  "user.resetPassword": "Password reset",
  "user.escalationBlocked": "Owner account change refused",
  "request.update": "Request updated",
  "user.password": "Password reset",
  "profile.update": "Profile updated",
  "profile.password": "Password changed",
};

export function auditActionLabel(locale: Locale, action: string): string {
  const label = ACTION_LABELS[action];
  return label ? t(locale, label) : action;
}
