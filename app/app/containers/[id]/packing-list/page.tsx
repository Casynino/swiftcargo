import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { buildSnapshot, type PackingSnapshot } from "@/lib/packing-list";
import { PackingListSheet } from "@/components/app/packing-list-sheet";
import { LOADABLE_CONTAINER_STATUSES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
/* The saved file is named after the page, so the container's own number goes in
   the title — a downloads folder full of "packing-list.pdf" tells nobody which
   sailing they are holding. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    select: { reference: true },
  });
  return {
    title: {
      absolute: container
        ? `Packing list ${container.reference}`
        : "Packing list",
    },
  };
}


/**
 * The manifest, as printed.
 *
 * One container, many customers, one line each — the document that goes to the
 * shipping line and to customs, and the one Dar checks the boxes off against.
 * Rendered from the snapshot rather than the live rows for the same reason as
 * the delivery note.
 */
export default async function PackingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  await requirePermission("packingList.view");
  const { id } = await params;

  const [list, company, box] = await Promise.all([
    prisma.packingList.findUnique({
      where: { containerId: id },
      include: { issuedBy: { select: { name: true } } },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.container.findUnique({ where: { id }, select: { status: true } }),
  ]);
  /* A number handed out early does not freeze the box. Until the seal the
     sheet is still what is loaded right now. */
  const stillOpen = !!box && LOADABLE_CONTAINER_STATUSES.includes(box.status);

  /*
    ISSUED OR NOT, THERE IS ALWAYS A LIST.

    Before the container is sealed this is drawn live from what is loaded, so
    the sheet a clerk prints mid-load is what is actually in the box at that
    moment. Sealing freezes it, and from then on the frozen copy is what prints
    — the paper somebody is holding at a port cannot be rewritten by a later
    correction.
  */
  const snap = (list && !stillOpen
    ? (list.snapshot as unknown as PackingSnapshot)
    : await buildSnapshot(prisma, id)) as PackingSnapshot | null;
  if (!snap) notFound();

  return (
    <PackingListSheet
      snap={snap}
      containerId={id}
      list={list ? { number: list.number, issuedAt: list.issuedAt, issuedBy: list.issuedBy?.name ?? null } : null}
      company={company}
    />
  );
}
