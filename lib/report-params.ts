import {
  PERIODS,
  periodRange,
  type PeriodKey,
  type Range,
} from "@/lib/finance-report";
import { REPORTS, type Currency, type ReportKey } from "@/lib/report-tables";

/**
 * The page, the spreadsheet and the PDF read the same address, so a report
 * downloaded is the report that was on the screen.
 */
export function readReportParams(sp: Record<string, string | undefined>) {
  const period: PeriodKey = sp.period && sp.period in PERIODS ? (sp.period as PeriodKey) : "month";
  const cur: Currency = sp.cur === "USD" ? "USD" : "TZS";
  const report: ReportKey = sp.report && sp.report in REPORTS ? (sp.report as ReportKey) : "profit-loss";
  const { current, previous } = periodRange(period);

  /* A typed from/to overrides the period for the downloads only — the page's
     headline figures stay on the period chosen at the top. */
  const parse = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : null);
  const from = parse(sp.from);
  const to = parse(sp.to);
  const reportRange: Range =
    from || to
      ? {
          from: from ?? current.from,
          to: to ? new Date(to.getTime() + 86_400_000) : current.to,
          label: `${sp.from ?? ""} – ${sp.to ?? ""}`,
        }
      : current;

  return {
    period,
    cur,
    report,
    current,
    previous,
    reportRange,
    container: sp.container || undefined,
    from: sp.from ?? "",
    to: sp.to ?? "",
  };
}
