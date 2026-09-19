import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { ReportTableView } from "@/components/app/report-table";
import { loadBooks } from "@/lib/finance-report";
import { readReportParams } from "@/lib/report-params";
import { buildReport, REPORTS } from "@/lib/report-tables";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

import { primeLocale } from "@/lib/server-t";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const p = readReportParams(await searchParams);
  return { title: { absolute: `Swift Cargo - ${REPORTS[p.report]} - ${p.reportRange.label}` } };
}

/** THE PDF: the same table as the page, on a sheet, saved from print. */
export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await primeLocale();
  await requirePermission("accounting.view");
  const sp = await searchParams;
  const p = readReportParams(sp);
  const books = await loadBooks();
  const table = buildReport(p.report, books, p.reportRange, p.cur, p.container);
  const back = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/finance/reports?${back.toString()}`} fallbackLabel="Profit & loss" />
        <PrintButton label="Download PDF / print" />
      </div>
      <article className="rounded-lg border bg-white p-8 text-black print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-black pb-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/swift-cargo.png" alt="" width={44} height={44} className="object-contain" />
            <div>
              <p className="font-bold uppercase tracking-wider">Swift Cargo</p>
              <p className="text-xs text-neutral-600">{table.title}</p>
            </div>
          </div>
          <div className="text-right text-xs text-neutral-600">
            <p className="font-semibold text-black">{p.reportRange.label}</p>
            <p>In {p.cur === "TZS" ? "shillings" : "dollars"}{books.today ? ` · USD 1 = TZS ${books.today.toLocaleString()}` : ""}</p>
            <p>Printed {new Date().toLocaleString("en-GB")}</p>
          </div>
        </header>
        <p className="mb-4 text-xs text-neutral-600">{table.description}</p>
        <ReportTableView table={table} cur={p.cur} printable />
      </article>
    </div>
  );
}
