-- Customs clearance as its own step between arriving at Dar and being ready.

ALTER TABLE "Cargo" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "clearedById" TEXT,
ADD COLUMN     "readyNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "storageNoticeAt" TIMESTAMP(3);

CREATE INDEX "Cargo_clearedAt_idx" ON "Cargo"("clearedAt");

ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Everything already booked in at Dar before this step existed was handled as
-- cleared — invoiced, paid for and collected on that understanding. It is
-- recorded as cleared on the day it was booked in, so no consignment that is
-- waiting at the counter today is suddenly refused, and no customer who was
-- already told their goods were ready is told so again, or told about storage
-- that began under the old rules. Only consignments booked in from now on go
-- through clearance.
UPDATE "Cargo" c
SET "clearedAt" = d."receivedAt",
    "storageNoticeAt" = now()
FROM "DarReceiving" d
WHERE d."cargoId" = c.id;

UPDATE "Cargo" c
SET "readyNotifiedAt" = now()
WHERE c.status IN ('READY_FOR_RELEASE', 'COLLECTED', 'DELIVERED')
   OR (EXISTS (SELECT 1 FROM "PickupNote" p WHERE p."cargoId" = c.id AND p.status IN ('ACTIVE', 'USED'))
       AND EXISTS (SELECT 1 FROM "DarReceiving" d WHERE d."cargoId" = c.id));
