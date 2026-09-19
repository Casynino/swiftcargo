import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatDate, formatMoney } from "@/lib/format";
import type { Valuation } from "@/lib/valuation";

import { primeLocale, T } from "@/lib/server-t";
const BASIS_LABEL: Record<string, string> = {
  PER_CBM: "per CBM",
  PER_KG: "per kg",
  FLAT: "flat",
};

/**
 * WHAT THIS CONSIGNMENT IS WORTH — FINANCE'S VIEW.
 *
 * The warehouse filled every figure in this table and has never seen this
 * screen. That separation is the point: the floor is rewarded for measuring
 * honestly because measuring has no visible price attached, and the office
 * cannot be told a volume was "adjusted" to land on a nicer number.
 *
 * Nothing here is owed by anybody yet. It is the rate book applied to what was
 * measured, recomputed on every load, and it moves if the rate book moves. Only
 * an invoice pins a price — the button below is where that happens.
 */
export function ValuationPanel({
  valuation,
  invoiced,
  atReceiving,
}: {
  valuation: Valuation;
  /** True once an invoice exists, in which case the invoice is the truth. */
  invoiced: boolean;
  /** What the book said the day China took it in, if it was priced then. */
  atReceiving?: { total: string; currency: string; on: Date } | null;
}) {
  const { lines, subtotal, unpriced, currency } = valuation;
  if (lines.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Value at today&apos;s rates</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoiced
              ? "For comparison only — the invoice below is what the customer owes."
              : "An estimate from the rate book. Nothing is owed until an invoice is issued."}
          </p>
        </div>
        <Badge tone={unpriced > 0 ? "warn" : "neutral"}>
          {unpriced > 0 ? `${unpriced} unpriced` : "All lines priced"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{T("Goods")}</TableHead>
              <TableHead>{T("Cargo type")}</TableHead>
              <TableHead className="text-right">CBM</TableHead>
              <TableHead className="text-right">{T("Rate")}</TableHead>
              <TableHead className="text-right">{T("Amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.reference}>
                <TableCell className="text-sm">
                  {line.description || "—"}
                  {line.descriptionZh ? (
                    <span className="block text-xs text-muted-foreground">
                      {line.descriptionZh}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {line.cargoType ?? "—"}
                </TableCell>
                <TableCell className="tnum text-right text-sm">
                  {line.basis === "PER_KG"
                    ? `${line.weightKg?.toString() ?? "—"} kg`
                    : formatCbm(line.cbm)}
                </TableCell>
                <TableCell className="tnum text-right text-sm text-muted-foreground">
                  {line.rate
                    ? `${formatMoney(line.rate, currency)} ${BASIS_LABEL[line.basis ?? ""] ?? ""}`
                    : "—"}
                </TableCell>
                <TableCell className="tnum text-right text-sm font-medium">
                  {line.blocked ? (
                    <span className="text-signal">—</span>
                  ) : (
                    formatMoney(line.amount, currency)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {lines.some((l) => l.blocked) ? (
          <ul className="space-y-1.5 rounded-md border border-signal/30 bg-signal/[0.06] p-3">
            {lines
              .filter((l) => l.blocked)
              .map((l) => (
                <li
                  key={l.reference}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-signal" />
                  <span>
                    <span className="tnum font-medium text-foreground">
                      {l.reference}
                    </span>{" "}
                    — {l.blocked}
                  </span>
                </li>
              ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-medium">
            {unpriced > 0 ? "Priced lines only" : "Freight subtotal"}
          </span>
          <span className="tnum text-xl font-semibold">
            {formatMoney(subtotal, currency)}
          </span>
        </div>

        {/* THE FIGURE THE BOOK GAVE ON THE DAY IT WAS RECEIVED, kept because a
            rate that moved between Guangzhou and Dar is the argument nobody can
            otherwise settle. Shown only when it differs from today's. */}
        {atReceiving && atReceiving.total !== subtotal.toString() ? (
          <p className="text-xs text-muted-foreground">
            At the rates in force when China received it on{" "}
            {formatDate(atReceiving.on)}, this came to{" "}
            <span className="tnum font-medium text-foreground">
              {formatMoney(atReceiving.total, atReceiving.currency)}
            </span>
            . The rate book has moved since.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
