"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Layers } from "lucide-react";

import { AskForCredit } from "@/components/app/ask-for-credit";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
/*
  The pending claims appear under two names, because they are not the same thing
  to the two desks. "Verify payments" is Finance working the queue; "With
  Finance" is Support watching what it handed up and can do nothing about. Only
  the desk that can do the job is shown the job.
*/
const VERIFIER_SUB = [
  ["/app/finance/collections", "The call list"],
  ["/app/finance/collections/verify", "Verify payments"],
  ["/app/finance/collections/sent-back", "Sent back"],
] as const;

const COLLECTOR_SUB = [
  ["/app/finance/collections", "The call list"],
  ["/app/finance/collections/with-finance", "With Finance"],
  ["/app/finance/collections/sent-back", "Sent back"],
] as const;

/**
 * THE THREE HALVES OF CHASING MONEY.
 *
 * Who owes it, what they say they have sent, and what Finance could not accept.
 * They are one job seen from three sides, so they share a header and switch in
 * place rather than living on three unrelated pages somebody has to know the
 * addresses of.
 */
export function CollectionsHeader({
  recordPayment,
  canVerify,
}: {
  /** The dialog is loaded on the server; the header only places it. */
  recordPayment?: React.ReactNode;
  /**
   * payment.verify. Finance works this workspace as a tab of the books; Support
   * shares it without the books, and must not be handed a row of doors it
   * cannot open. Navigation only — every action still checks for itself.
   */
  canVerify: boolean;
}) {
  const tx = useT();
  const pathname = usePathname();
  const sub = canVerify ? VERIFIER_SUB : COLLECTOR_SUB;

  return (
    <div className="space-y-5">
      <PageHeader
        title={tx("Payment follow-up")}
        description={tx("Who owes us money, what has gone to Finance, and what has come back.")}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/finance/payments/new">
                <Layers />
                {tx("Merge Payment")}
              </Link>
            </Button>
            {canVerify ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/finance/credit">
                  <CalendarClock />
                  {tx("Release on credit")}
                </Link>
              </Button>
            ) : (
              <AskForCredit canApprove={false} />
            )}
            {recordPayment}
          </>
        }
      />
      {canVerify ? <FinanceTabs /> : null}
      <div className="flex flex-wrap gap-2">
        {sub.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-foreground hover:bg-secondary"
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
