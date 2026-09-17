import { NextResponse, type NextRequest } from "next/server";

import { KIND_LABEL, reconciliationQueue } from "@/lib/reconciliation-workspace";
import { authorize } from "@/lib/session";

/* Prisma needs Node, never the edge; a whole period of books can outrun a
   short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The reconciliation queue as it stands on screen, as a file.
 *
 * SAME FILTERS, SAME ROWS. The export reads the identical query the page does,
 * so a manager who narrows to one account and one week gets that and not a
 * whole year — an export that quietly ignores the filters is how a figure ends
 * up in a meeting with no relationship to the screen it was taken from.
 *
 * Paging is the one thing it drops: the screen shows forty at a time because a
 * person reads forty at a time, and a file has no such limit. Numbers stay
 * numbers, so the columns can be summed where they land.
 */
export async function GET(request: NextRequest) {
  try {
    await authorize("record.review");
  } catch {
    return new NextResponse("Not permitted.", { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams) as Record<string, string>;
  const queue = await reconciliationQueue({ ...params, page: "1" });

  const rows: (string | number)[][] = [
    [
      "Reference",
      "Date",
      "Type",
      "Title",
      "Account",
      "Direction",
      "Amount",
      "Currency",
      "Amount TZS",
      "Cancelled",
      "Recorded by",
      "Evidence",
      "Standing",
      "Actual amount",
      "Verdict by",
      "Verdict at",
      "Note",
    ],
  ];

  for (const row of queue.all) {
    rows.push([
      row.reference,
      row.at.toISOString().slice(0, 10),
      KIND_LABEL[row.kind],
      row.title,
      row.account ?? "",
      row.direction,
      row.amount.toString(),
      row.currency,
      row.tzs ? row.tzs.toString() : "",
      row.cancelled ? "yes" : "",
      row.recordedBy ?? "",
      row.evidence.length,
      row.state,
      row.standing?.actualAmount ? row.standing.actualAmount.toString() : "",
      row.standing?.reviewedBy ?? "",
      row.standing ? row.standing.at.toISOString().slice(0, 16).replace("T", " ") : "",
      row.standing?.note ?? "",
    ]);
  }

  /* Quote anything that would otherwise break a column, and double any quote
     inside it — a vendor called 5" Pipes must not shift every figure on its row
     one column to the left. */
  const escape = (cell: string | number) => {
    const value = String(cell ?? "");
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Swift-Cargo-reconciliation-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
