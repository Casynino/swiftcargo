import type { Prisma } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";

/**
 * CARGO IN DAR WITH NO SAILING ON RECORD, WAITING FOR A PRICE.
 *
 * Finance confirms prices a container at a time, and the container table only
 * lists what is on a container. Consignments that were already standing in Dar
 * when this system started have a Dar receiving row and no container line, so
 * that table never shows them — while every "landed and not billed" counter
 * does count them, and links to that table. Without this list the counter
 * points at a page where the consignment can be neither found nor priced.
 *
 * Same test as a container's "waiting for prices": counted at Dar, and nothing
 * but drafts billed against it. A draft is still Finance's to confirm. No money
 * is selected — the list is a door to the consignment, and the figures live
 * behind Finance's permission on the pages it opens.
 */
export const UNSAILED_TO_PRICE = {
  deletedAt: null,
  OR: [{ chinaReceiving: { isNot: null } }, { darReceiving: { isNot: null } }],
    /* Nobody is billed for boxes nobody found. */
    status: { notIn: ["MISSING_AT_DAR", "CANCELLED"] },
  containerLines: { none: {} },
  invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
} satisfies Prisma.CargoWhereInput;

export async function unsailedToPrice(client: TxClient | typeof prisma = prisma) {
  return client.cargo.findMany({
    where: UNSAILED_TO_PRICE,
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      reference: true,
      description: true,
      status: true,
      receiver: { select: { code: true, fullName: true } },
      darReceiving: {
        select: { packagesCount: true, piecesCount: true, cbm: true, receivedAt: true },
      },
      invoices: {
        where: { status: "DRAFT" },
        select: { id: true, number: true },
      },
    },
  });
}

export type UnsailedRow = Awaited<ReturnType<typeof unsailedToPrice>>[number];
