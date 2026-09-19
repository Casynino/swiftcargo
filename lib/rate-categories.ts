import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * The rate book's loose-cargo categories and their live rate per CBM, for the
 * price dialogs. Choosing one fills its rate in; the desk may still type an
 * agreed rate over it for that one bill. Nothing here writes to the book.
 */
export async function bookCategories(): Promise<{ name: string; rate: number }[]> {
  const now = new Date();
  const rows = await prisma.shippingRate.findMany({
    where: {
      active: true,
      service: "LCL",
      basis: "PER_CBM",
      cargoType: { not: null },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: [{ cargoType: "asc" }, { effectiveFrom: "desc" }],
    select: { cargoType: true, rate: true },
  });
  const out: { name: string; rate: number }[] = [];
  for (const r of rows) {
    if (!out.some((c) => c.name === r.cargoType)) out.push({ name: r.cargoType!, rate: Number(r.rate) });
  }
  return out;
}

/** The cargo's one category — its lines' shared type, or its commodity. */
export function categoryOfCargo(cargo: {
  commodity: string | null;
  packages: { cargoType: string | null }[];
}): string | null {
  if (cargo.packages.length === 0) return cargo.commodity ?? null;
  const types = [...new Set(cargo.packages.map((p) => p.cargoType))];
  return types.length === 1 ? types[0] : null;
}
