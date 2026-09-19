import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
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
import { bookCategories } from "@/lib/rate-categories";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Verify payments" };

/**
 * WHAT PEOPLE SAY THEY HAVE SENT.
 *
 * Nothing here counts against a bill yet. Check it against the bank, then
 * verify — that press is what issues the receipt and moves the balance.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("finance.view");
  /* The job belongs to the desk that can do it. Support reads the same rows,
     without the buttons, as what is sitting with Finance. */
  if (!can(user.role, "payment.verify")) {
    redirect("/app/finance/collections/with-finance");
  }
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const { rows, totalTzs, totalUsd } = await claimsAt("PENDING", query);

  return (
    <div className="space-y-5">
      <CollectionsHeader
        recordPayment={<RecordPaymentButton />}
        canVerify={can(user.role, "payment.verify")}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { lead: formatMoney(totalTzs, "TZS"), note: "waiting on you to agree it" },
          {
            lead: formatMoney(totalUsd, "USD"),
            note: "the same money, at today\u2019s rate",
          },
        ].map((card) => (
          <div key={card.note} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-warning">
              {rows.length} waiting on you
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
        tools={{
          canChangeBill: can(user.role, "invoice.discount"),
          canChangeRate: can(user.role, "invoice.edit"),
          categories: can(user.role, "invoice.discount") ? await bookCategories() : [],
        }}
        accounts={(
          await prisma.bankAccount.findMany({
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
            select: { id: true, bankName: true, currency: true },
          })
        ).map((a) => ({ id: a.id, label: `${a.bankName} (${a.currency})`, currency: a.currency }))}
        mode="verify"
        mayVerify
      />
    </div>
  );
}
