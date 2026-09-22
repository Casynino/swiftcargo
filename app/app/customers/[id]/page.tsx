import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Copy, Package, Pencil, Plus } from "lucide-react";

import { CargoStatusBadge } from "@/components/app/status-badge";
import { CopyField } from "@/components/app/copy-field";
import { SupplierAddressCard } from "@/components/app/supplier-address-card";
import { supplierAddress } from "@/lib/supplier-address";
import { EmptyState } from "@/components/app/empty-state";
import { Field } from "@/components/app/field";
import { DeleteCustomerButton } from "@/components/app/delete-customer-button";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Customer" };

/**
 * One customer, and everything anybody needs to answer a phone call about them.
 *
 * This is the screen §10 describes: cargo, status, container, invoice and
 * balance side by side, so Support does not have to open four pages while
 * somebody waits on the line.
 */
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("customer.view");
  const { id } = await params;

  /* Both warehouses look a customer up to find whose boxes these are. The bill
     is not theirs to read — the same rule as the customer list — so without
     finance.view the invoices are never loaded, never mind drawn. */
  const showMoney = can(user.role, "finance.view");

  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      invoices: {
        where: showMoney ? undefined : { id: { in: [] } },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { payments: true },
      },
      login: { select: { email: true, lastLoginAt: true, status: true } },
    },
  });

  if (!customer) notFound();

  /* The receiver is who is billed and who collects, so a customer who only
     ever receives would otherwise read "No cargo yet" on their own page. */
  const cargoList = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      OR: [{ senderId: customer.id }, { receiverId: customer.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      containerLines: { include: { container: true } },
      invoices: {
        where: showMoney ? undefined : { id: { in: [] } },
        include: { payments: true },
      },
    },
  });
  const invoices = showMoney ? customer.invoices : [];

  const balance = invoices
    .filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT")
    .reduce((sum, invoice) => sum + Number(outstandingOf(invoice)), 0);

  const forSupplier = await supplierAddress(customer.shippingMark ?? customer.fullName.toUpperCase());

  /* The whole relationship in one line, counted rather than listed: the page
     below shows the latest twenty-five, and "how much of everything" is the
     first question on the phone. */
  const mineWhere = { deletedAt: null, OR: [{ senderId: customer.id }, { receiverId: customer.id }] };
  const [cargoCount, movingCount, invoiceCount, bookingCount, pickupCount] = await Promise.all([
    prisma.cargo.count({ where: mineWhere }),
    prisma.cargo.count({
      where: {
        ...mineWhere,
        status: { in: ["ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED", "DEPARTED_CHINA", "IN_TRANSIT", "ARRIVED_TANZANIA"] },
      },
    }),
    showMoney
      ? prisma.invoice.count({ where: { customerId: customer.id, status: { notIn: ["DRAFT", "CANCELLED"] } } })
      : Promise.resolve(0),
    prisma.containerBooking.count({ where: { customerId: customer.id } }),
    prisma.pickupRequest.count({ where: { customerId: customer.id } }),
  ]);
  const strip: [string, string][] = [
    ["Cargo", String(cargoCount)],
    ["Active shipments", String(movingCount)],
    ...(showMoney
      ? ([
          ["Invoices", String(invoiceCount)],
          ["Outstanding", formatMoney(balance, "USD")],
        ] as [string, string][])
      : []),
    ["Bookings", String(bookingCount)],
    ["Pickup requests", String(pickupCount)],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.fullName}
        description={customer.businessName ?? undefined}
        back={{ href: "/app/customers", label: "Customers" }}
        actions={
          <>
            {can(user.role, "receiving.china") ? (
              <Button asChild>
                <Link href="/app/receive/new">
                  <Plus />
                  {T("Receive cargo")}
                </Link>
              </Button>
            ) : null}
            {can(user.role, "customer.manage") ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/app/customers/${customer.id}/edit`}>
                    <Pencil />
                    {T("Edit")}
                  </Link>
                </Button>
                {can(user.role, "customer.delete") ? (
                  <DeleteCustomerButton customerId={customer.id} name={customer.fullName} />
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {strip.map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{T(label)}</dt>
            <dd className="tnum mt-0.5 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{T("Details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Field label={T("Customer code")} value={customer.code} mono />
              <Field label={T("Phone")} value={customer.phone} mono />
              <Field label={T("Second phone")} value={customer.altPhone} mono />
              <Field label={T("Email")} value={customer.email} />
              <Field label={T("City")} value={customer.city} />
              <Field label="TIN / VRN" value={customer.taxId} mono />
              <Field
                label={T("Registered")}
                value={formatDate(customer.createdAt)}
                className="sm:col-span-1"
              />
              <Field
                label={T("Portal account")}
                value={
                  customer.login ? (
                    <Badge tone="good">{T("Registered")}</Badge>
                  ) : (
                    <span className="text-muted-foreground">{T("Not signed up")}</span>
                  )
                }
              />
            </dl>
            {customer.notes ? (
              <p className="mt-5 rounded-md bg-secondary px-3 py-2 text-sm">
                {customer.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Name / shipping mark")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CopyField
                value={customer.shippingMark ?? customer.fullName.toUpperCase()}
                label={T("Name / shipping mark")}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {T("Their name as written on every box — what they give the supplier, and how Guangzhou knows whose cargo has arrived.")}
              </p>
            </CardContent>
          </Card>

          {forSupplier ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{T("Address for their supplier")}</CardTitle>
              </CardHeader>
              <CardContent>
                <SupplierAddressCard {...forSupplier} />
              </CardContent>
            </Card>
          ) : null}

          {showMoney ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Outstanding")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="tnum text-3xl font-semibold tracking-tight">
                {formatMoney(balance, "USD")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Across {invoices.length} invoice
                {invoices.length === 1 ? "" : "s"}. Derived from verified
                payments only.
              </p>
            </CardContent>
          </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{T("Cargo")}</CardTitle>
        </CardHeader>
        {cargoList.length === 0 ? (
          <EmptyState
            icon="Package"
            title={T("No cargo yet")}
            description={T("Nothing has been booked for this customer.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Reference")}</TableHead>
                <TableHead>{T("Description")}</TableHead>
                <TableHead>{T("Container")}</TableHead>
                <TableHead>{T("Status")}</TableHead>
                {showMoney ? <TableHead className="text-right">{T("Owing")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargoList.map((cargo) => {
                const container = cargo.containerLines.at(-1)?.container;
                const owing = cargo.invoices
                  .filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT")
                  .reduce((sum, i) => sum + Number(outstandingOf(i)), 0);
                return (
                  <TableRow key={cargo.id}>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${cargo.id}`}
                        className="tnum font-medium hover:underline"
                      >
                        {cargo.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      <Tx>{cargo.description}</Tx>
                    </TableCell>
                    <TableCell className="tnum text-sm text-muted-foreground">
                      {container?.containerNumber ?? container?.reference ?? "—"}
                    </TableCell>
                    <TableCell>
                      <CargoStatusBadge status={cargo.status} />
                    </TableCell>
                    {showMoney ? (
                      <TableCell className="tnum text-right text-sm">
                        {owing > 0 ? formatMoney(owing, "USD") : "—"}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {showMoney && customer.invoices.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{T("Invoices")}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Number")}</TableHead>
                <TableHead>{T("Issued")}</TableHead>
                <TableHead>{T("Total")}</TableHead>
                <TableHead>{T("Outstanding")}</TableHead>
                <TableHead className="text-right">{T("Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      href={`/app/finance/invoices/${invoice.id}`}
                      className="tnum font-medium hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(invoice.issuedAt)}
                  </TableCell>
                  <TableCell className="tnum text-sm">
                    {formatMoney(invoice.total, invoice.currency)}
                  </TableCell>
                  <TableCell className="tnum text-sm">
                    {formatMoney(outstandingOf(invoice), invoice.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      tone={
                        invoice.status === "PAID"
                          ? "good"
                          : invoice.status === "OVERDUE"
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
