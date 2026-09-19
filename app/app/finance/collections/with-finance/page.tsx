import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";

import { ClaimList } from "@/components/app/claim-list";
import { CollectionsHeader } from "@/components/app/collections-header";
import { RecordPaymentButton } from "@/components/app/record-payment-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { claimsAt } from "@/lib/claims";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { bookCategories } from "@/lib/rate-categories";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "With Finance" };

/**
 * WHAT THIS DESK HANDED UP AND IS WAITING TO HEAR ABOUT.
 *
 * The same pending claims Finance verifies, without the buttons: a customer
 * ringing to ask "did you get my transfer?" is answered from here. Nothing on
 * this list counts against a bill until Finance agrees it.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("finance.view");
  /* A verifier asking for the pending list wants the copy with the buttons —
     this one is a dead end dressed as a queue for them. */
  if (can(user.role, "payment.verify")) {
    redirect("/app/finance/collections/verify");
  }
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const { rows, totalTzs, totalUsd } = await claimsAt("PENDING", query);

  return (
    <div className="space-y-5">
      <CollectionsHeader recordPayment={<RecordPaymentButton />} canVerify={false} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { lead: formatMoney(totalTzs, "TZS"), note: "with Finance, not yet agreed" },
          {
            lead: formatMoney(totalUsd, "USD"),
            note: "the same money, at today’s rate",
          },
        ].map((card) => (
          <div key={card.note} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-warning">
              {rows.length} waiting on Finance
            </p>
            <p className="tnum mt-1 text-3xl font-semibold">{card.lead}</p>
            <p className="tnum mt-1 text-xs text-muted-foreground"><Tx>{card.note}</Tx></p>
          </div>
        ))}
      </div>

      <form className="flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder={T("Customer, reference, invoice or tracking number…")}
            className="pl-9"
            aria-label={T("Search")}
          />
        </div>
        <Button type="submit" variant="outline">
          {T("Search")}
        </Button>
      </form>

      <ClaimList
        rows={rows}
        mode="waiting"
        mayVerify={false}
        accounts={(
          await prisma.bankAccount.findMany({
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
            select: { id: true, bankName: true, currency: true },
          })
        ).map((a) => ({ id: a.id, label: `${a.bankName} (${a.currency})`, currency: a.currency }))}
        tools={{
          canChangeBill: can(user.role, "invoice.discount"),
          canChangeRate: can(user.role, "invoice.edit"),
          categories: can(user.role, "invoice.discount") ? await bookCategories() : [],
        }}
      />
    </div>
  );
}
