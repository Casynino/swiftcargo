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
/**
 * EVERY CONSIGNMENT WAITING FOR A PRICE, ON A CONTAINER OR NOT.
 *
 * Measured on either floor, not missing, and nothing but drafts billed. Each
 * price list narrows this — one container's lines, or no container at all —
 * and a counter that says how many are waiting counts this, so the number on
 * the dashboard is the number of rows the lists hold between them.
 */
export const WAITING_FOR_A_PRICE = {
  deletedAt: null,
  OR: [{ chinaReceiving: { isNot: null } }, { darReceiving: { isNot: null } }],
  /* Nobody is billed for boxes nobody found. */
  status: { notIn: ["MISSING_AT_DAR", "CANCELLED"] },
  invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
} satisfies Prisma.CargoWhereInput;

export const UNSAILED_TO_PRICE = {
  ...WAITING_FOR_A_PRICE,
  containerLines: { none: {} },
} satisfies Prisma.CargoWhereInput;

/**
 * THE SAME WAITING LIST, READ APART BY WHO IS HOLDING THE BOXES.
 *
 * UNSAILED_TO_PRICE is still what confirming narrows against — one consignment
 * is priced the same way whichever floor measured it. These two exist only so
 * the price list can say where a row actually is: a consignment Guangzhou has
 * not yet handed to Dar is not "in Dar with no container", and calling it that
 * sent Finance looking for boxes on the wrong floor.
 */
export const UNSAILED_IN_CHINA = {
  ...UNSAILED_TO_PRICE,
  darReceiving: null,
} satisfies Prisma.CargoWhereInput;

export const UNSAILED_IN_DAR = {
  ...UNSAILED_TO_PRICE,
  darReceiving: { isNot: null },
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
