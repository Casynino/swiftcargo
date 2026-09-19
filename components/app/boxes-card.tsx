import Link from "next/link";
import { Printer, QrCode } from "lucide-react";

import { BoxActions } from "@/components/app/box-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
/**
 * EVERY PHYSICAL BOX OF THE CONSIGNMENT, EACH WITH ITS OWN STORY.
 *
 * One row per box: which line it is on, and what has happened to it — in
 * China, received at Dar, damaged, missing, handed over — with who and when.
 * The box a scanner just opened is picked out. Under it, every scan of every
 * box, including the ones that found something wrong.
 */
export async function BoxesCard({
  cargoId,
  highlight,
  canReport,
  canMissing,
  canPrint,
}: {
  cargoId: string;
  highlight: string | null;
  canReport: boolean;
  canMissing: boolean;
  canPrint: boolean;
}) {
  const [boxes, scans] = await Promise.all([
    prisma.cargoBox.findMany({
      where: { cargoId },
      orderBy: { sequence: "asc" },
      include: { package: { select: { reference: true, description: true, containerId: true, container: { select: { reference: true } } } } },
    }),
    prisma.scanEvent.findMany({
      where: { cargoId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { box: { select: { sequence: true } } },
    }),
  ]);
  if (boxes.length === 0) return null;

  const userIds = [
    ...new Set(
      [
        ...boxes.flatMap((b) => [b.darReceivedById, b.collectedById, b.damagedById, b.missingById]),
        ...scans.map((s) => s.userId),
      ].filter((v): v is string => Boolean(v))
    ),
  ];
  const users = new Map(
    (await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [
      u.id,
      u.name ?? "—",
    ])
  );
  const who = (id: string | null) => (id ? users.get(id) ?? "—" : "—");

  const live = boxes.filter((b) => !b.voidedAt);
  const count = (pick: (b: (typeof boxes)[number]) => unknown) => live.filter(pick).length;

  const status = (b: (typeof boxes)[number]) => {
    if (b.voidedAt) return ["Taken off", "bg-secondary text-muted-foreground"] as const;
    if (b.collectedAt) return ["Handed over", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"] as const;
    if (b.darReceivedAt) return ["At Dar", "bg-sky-500/15 text-sky-700 dark:text-sky-300"] as const;
    if (b.missingAt) return ["Missing", "bg-red-500/15 text-red-700 dark:text-red-300"] as const;
    if (b.package.containerId) return ["In container", "bg-brand/10 text-brand"] as const;
    return ["In China", "bg-amber-500/15 text-amber-700 dark:text-amber-300"] as const;
  };

  const resultTone: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    refused: "text-red-600 dark:text-red-400",
    unknown: "text-red-600 dark:text-red-400",
  };

  return (
    <Card id="boxes">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-4" />
            {T("Boxes · one code each")}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {live.length} box{live.length === 1 ? "" : "es"} · {count((b) => b.darReceivedAt)} received at Dar ·{" "}
            {count((b) => b.collectedAt)} handed over
            {count((b) => b.damagedAt) ? ` · ${count((b) => b.damagedAt)} damaged` : ""}
            {count((b) => b.missingAt && !b.darReceivedAt) ? ` · ${count((b) => b.missingAt && !b.darReceivedAt)} missing` : ""}
          </p>
        </div>
        {canPrint ? (
          <Link
            href={`/app/cargo/${cargoId}/label`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary"
          >
            <Printer className="size-4" />
            {T("Print all box labels")}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{T("Box")}</th>
                <th className="py-2 pr-3 font-medium">{T("Line")}</th>
                <th className="py-2 pr-3 font-medium">{T("Where it is")}</th>
                <th className="py-2 pr-3 font-medium">{T("What happened")}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => {
                const [label, tone] = status(b);
                return (
                  <tr
                    key={b.id}
                    id={`box-${b.id}`}
                    className={cn(
                      "border-b align-top",
                      b.id === highlight && "bg-brand/10 ring-2 ring-inset ring-brand",
                      b.voidedAt && "opacity-60"
                    )}
                  >
                    <td className="tnum py-2 pr-3 font-semibold">
                      {b.sequence} <span className="font-normal text-muted-foreground">/ {live.length}</span>
                      {b.id === highlight ? (
                        <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
                          {T("Scanned")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="tnum text-xs text-muted-foreground">{b.package.reference}</span>
                      <span className="block">{b.package.description ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{label}</span>
                      {b.package.container && !b.darReceivedAt ? (
                        <span className="tnum block pt-1 text-xs text-muted-foreground">{b.package.container.reference}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {b.darReceivedAt ? <p>Received {formatDateTime(b.darReceivedAt)} · {who(b.darReceivedById)}</p> : null}
                      {b.collectedAt ? <p>Handed over {formatDateTime(b.collectedAt)} · {who(b.collectedById)}</p> : null}
                      {b.damagedAt ? (
                        <p className="text-amber-700 dark:text-amber-300">
                          Damaged {formatDateTime(b.damagedAt)} · {who(b.damagedById)} — {b.damageNote}
                        </p>
                      ) : null}
                      {b.missingAt ? (
                        <p className="text-red-700 dark:text-red-300">
                          Reported missing {formatDateTime(b.missingAt)} · {who(b.missingById)}
                        </p>
                      ) : null}
                      {b.voidedAt ? <p>Taken off its line {formatDateTime(b.voidedAt)}</p> : null}
                    </td>
                    <td className="py-2 text-right">
                      {!b.voidedAt ? (
                        <div className="flex flex-col items-end gap-2">
                          {canPrint ? (
                            <Link href={`/app/cargo/${cargoId}/label?box=${b.id}`} className="text-xs text-brand hover:underline">
                              {T("Reprint label")}
                            </Link>
                          ) : null}
                          {canReport && !b.collectedAt ? (
                            <BoxActions
                              boxId={b.id}
                              canMissing={canMissing}
                              alreadyMissing={Boolean(b.missingAt)}
                              received={Boolean(b.darReceivedAt)}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {scans.length > 0 ? (
          <div>
            <p className="text-sm font-semibold">{T("Scan history")}</p>
            <ul className="mt-2 divide-y rounded-lg border text-xs">
              {scans.map((scan) => (
                <li key={scan.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className={cn("font-semibold", resultTone[scan.result] ?? "")}>{scan.action.replace(/-/g, " ")}</span>
                    {scan.box ? <span className="text-muted-foreground"> · box {scan.box.sequence}</span> : null}
                    <span className="text-muted-foreground"> · {scan.workflow.replace(/-/g, " ")}</span>
                    {scan.detail ? <span className="block text-muted-foreground"><Tx>{scan.detail}</Tx></span> : null}
                  </span>
                  <span className="text-muted-foreground">
                    {who(scan.userId)}
                    {scan.department ? ` · ${scan.department.replace(/_/g, " ").toLowerCase()}` : ""} · {formatDateTime(scan.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
