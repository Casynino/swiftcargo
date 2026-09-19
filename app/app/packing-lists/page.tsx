import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Packing lists" };

export default async function PackingListsPage() {
  await primeLocale();
  await requirePermission("packingList.view");

  const lists = await prisma.packingList.findMany({
    orderBy: { issuedAt: "desc" },
    take: 100,
    include: {
      container: {
        select: { id: true, reference: true, containerNumber: true, sealNumber: true },
      },
      issuedBy: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packing lists"
        description="One per container, frozen at the moment it was issued."
      />
      <Card>
        {lists.length === 0 ? (
          <EmptyState
            icon="ClipboardList"
            title="Nothing issued yet"
            description="A packing list is issued from the container it describes."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Container</TableHead>
                <TableHead className="hidden md:table-cell">Seal</TableHead>
                <TableHead className="hidden lg:table-cell">Issued by</TableHead>
                <TableHead>Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell>
                    <Link
                      href={`/app/containers/${list.container.id}/packing-list`}
                      className="tnum font-medium hover:underline"
                    >
                      {list.number}
                    </Link>
                  </TableCell>
                  <TableCell className="tnum text-sm">
                    {list.container.reference}
                  </TableCell>
                  <TableCell className="tnum hidden text-sm text-muted-foreground md:table-cell">
                    {list.container.sealNumber ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {list.issuedBy?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(list.issuedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
