import { PrismaClient, Prisma } from "@prisma/client";

/**
 * One client per process. Next.js reloads modules on every edit in development,
 * and a new pool per reload exhausts Postgres connections within a few minutes.
 *
 * Cached on globalThis in production too. A serverless instance can evaluate
 * this module more than once (route handlers and server components are bundled
 * separately), and each extra client is another pool against a database whose
 * connection ceiling is shared by every instance. On Neon, DATABASE_URL is the
 * pooled (PgBouncer) address with `pgbouncer=true&connection_limit=5`: a few
 * connections per instance, because the dashboards run their queries side by
 * side, and the pooler fans the instances in. Migrations use DIRECT_URL, because
 * PgBouncer in transaction mode cannot run them.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;

/**
 * The client inside a `prisma.$transaction(...)` callback.
 *
 * Anything that mints a document number or appends to an audit trail takes one
 * of these rather than the singleton, so the number and the row it names live
 * or die together.
 */
export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export { Prisma };
