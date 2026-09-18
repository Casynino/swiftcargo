-- ONE LIVE BILL PER CONSIGNMENT THAT HAS NO SAILING.
--
-- A consignment on a container is already held to one bill per sailing by the
-- unique constraint on "containerCargoId". A consignment that reached Dar with
-- no container on record — everything that was already standing on the floor
-- when this system started — has no such line, so nothing in the database
-- stopped two of them: pricing reads "has this cargo a bill yet?" and then
-- writes one, and two presses of Confirm landing together both read "none".
--
-- The application takes a transaction-scoped advisory lock on the consignment
-- before it reads, which is the first line of defence and the one that gives
-- the loser a sentence to read. This is the second: it holds whatever the
-- application forgets, including a script, a console, or a future caller that
-- does not know about the lock.
--
-- Cancelled bills are outside it on purpose. A bill raised in error is
-- cancelled, never deleted, and the consignment must still be billable
-- afterwards.
--
-- Prisma has no way to say "unique, but only for these rows", so this index
-- exists only here. It is invisible to the schema file and must not be removed
-- by a later `prisma migrate dev` that has not been told about it.
CREATE UNIQUE INDEX "Invoice_cargoId_unsailed_live_key"
  ON "Invoice" ("cargoId")
  WHERE "containerCargoId" IS NULL AND "status" <> 'CANCELLED';
