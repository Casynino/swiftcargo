import { NextResponse, type NextRequest } from "next/server";

import { invoiceLogo } from "@/lib/invoice-pdf-data";
import {
  managementPeriod,
  managementReportLabel,
  reportToCsv,
  runManagementReport,
} from "@/lib/management-reports";
import { prisma } from "@/lib/prisma";
import { renderReportPdf } from "@/lib/report-pdf";
import { authorize } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a long period or a thick
   document can outrun a short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One management report, as a spreadsheet or as a document.
 *
 * Same engine and the same period as the page it was pressed on — the period,
 * or the typed from/to, travel in the address and are resolved by the one
 * helper the page uses, so a file and the screen it came from cannot cover
 * different weeks.
 *
 * Two formats, one table. The spreadsheet is for working with the numbers; the
 * PDF is for handing them to somebody. Both are rendered from the same result.
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await authorize("record.review");
  } catch {
    return new NextResponse("Not permitted.", { status: 403 });
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const key = sp.report ?? "";
  const label = managementReportLabel(key);
  if (!label) return NextResponse.json({ error: "No such report." }, { status: 404 });

  const period = managementPeriod(sp);
  const report = await runManagementReport(key, period.current);
  if (!report) return NextResponse.json({ error: "No such report." }, { status: 404 });

  /* A report that reads the whole book as at today says so on its own file,
     rather than printing a window that did not narrow it. */
  const covering = report.asAt
    ? `As at ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
    : period.current.label;
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `Swift-Cargo-${label}-${covering}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");

  if (sp.format === "pdf") {
    const company = await prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { name: true },
    });
    const pdf = renderReportPdf(report, {
      company: company?.name ?? "Swift Cargo",
      period: covering,
      preparedBy: user.name,
      logo: await invoiceLogo(),
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name || `report-${stamp}`}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name || `report-${stamp}`}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
