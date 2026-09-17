import { NextResponse } from "next/server";

import { formatRate } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { monthLabel, payrollRun, payrollView } from "@/lib/payroll";
import { renderPayslipsPdf } from "@/lib/payslip-pdf";
import { companySettings } from "@/lib/pricing";
import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a long period or a thick
   document can outrun a short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A paid run's payslips as a file: every person, or one with `?line=`.
 *
 * Only a PAID run has slips. A slip says what somebody was paid, and until the
 * money has left the account that sentence is not true yet — a draft printed and
 * handed out is a promise nobody agreed.
 *
 * Open to the desk that prepares the run and the desk that agrees it, and to
 * nobody else: a salary is the most private figure in the building.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const user = await requireStaff();
  if (!canAny(user.role, ["payroll.prepare", "payroll.approve"])) {
    return NextResponse.json({ error: t("en", "You do not have permission to do that.") }, { status: 403 });
  }

  const { runId } = await params;
  const run = await payrollRun(decodeURIComponent(runId));
  if (!run) {
    return NextResponse.json({ error: t("en", "That run no longer exists.") }, { status: 404 });
  }
  if (run.status !== "PAID" || !run.expense) {
    return NextResponse.json(
      { error: t("en", "Payslips exist once the run has been paid.") },
      { status: 409 }
    );
  }

  const lineId = new URL(request.url).searchParams.get("line");
  const view = payrollView(run, null);
  const lines = lineId ? view.lines.filter((l) => l.id === lineId) : view.lines;
  if (lines.length === 0) {
    return NextResponse.json({ error: t("en", "That salary line is not on this run.") }, { status: 404 });
  }

  const [company, logo] = await Promise.all([companySettings(), invoiceLogo()]);
  const rateLabel = run.expense.currency === "USD" ? null : formatRate(run.expense.fxRate);

  const pdf = renderPayslipsPdf(
    lines.map((line) => ({
      company: company?.name ?? "Swift Cargo",
      address: company?.darAddress ?? null,
      logo,
      code: run.code,
      period: monthLabel(run.year, run.month),
      paidOn: formatDate(run.paidAt ?? run.expense?.paidDate),
      paidFrom: run.account ? `${run.account.bankName} (${run.account.currency})` : "—",
      expenseReference: run.expense!.reference,
      approvedBy: run.approvedBy?.name ?? null,
      name: line.name,
      roleLabel: line.roleLabel,
      note: line.note,
      gross: line.figures.gross,
      allowance: line.figures.allowance,
      deduction: line.figures.deduction,
      net: line.figures.net,
      rateLabel,
    }))
  );

  const who = lines.length === 1 ? lines[0].name.replace(/[^\p{L}\p{N}]+/gu, "-") : "all";
  const ascii = `Payslip-${run.code}-${who}.pdf`.replace(/[^\x20-\x7E]/g, "");
  const full = `Payslip ${run.code} ${lines.length === 1 ? lines[0].name : "all staff"}.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`,
      "Cache-Control": "no-store",
    },
  });
}
