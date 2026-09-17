import { NextResponse, type NextRequest } from "next/server";

import { loadBooks } from "@/lib/finance-report";
import { readReportParams } from "@/lib/report-params";
import { buildReport } from "@/lib/report-tables";
import { authorize } from "@/lib/session";

/* Prisma needs Node, never the edge; a whole period of books can outrun a
   short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * THE SPREADSHEET.
 *
 * CSV, because every spreadsheet opens it and an accountant's own template can
 * import it. Numbers stay numbers — nothing is formatted into text — so the
 * columns can be summed where they land.
 */
export async function GET(request: NextRequest) {
  try {
    await authorize("accounting.view");
  } catch {
    return new NextResponse("Not permitted.", { status: 403 });
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const p = readReportParams(sp);
  const books = await loadBooks();
  const table = buildReport(p.report, books, p.reportRange, p.cur, p.container);

  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    table.columns.map((c) => escape(c.label)).join(","),
    ...table.rows.map((row) => row.map(escape).join(",")),
    ...(table.total ? [table.total.map(escape).join(",")] : []),
  ];

  const name = `${table.title} ${p.reportRange.label}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Swift-Cargo-${name}.csv"`,
    },
  });
}
