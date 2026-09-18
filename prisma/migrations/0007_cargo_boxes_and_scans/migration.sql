-- CreateTable
CREATE TABLE "CargoBox" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "darReceivedAt" TIMESTAMP(3),
    "darReceivedById" TEXT,
    "darContainerId" TEXT,
    "damagedAt" TIMESTAMP(3),
    "damagedById" TEXT,
    "damageNote" TEXT,
    "missingAt" TIMESTAMP(3),
    "missingById" TEXT,
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "pickupNoteId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "boxId" TEXT,
    "cargoId" TEXT,
    "userId" TEXT,
    "role" TEXT,
    "department" TEXT,
    "workflow" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "containerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargoBox_qrToken_key" ON "CargoBox"("qrToken");

-- CreateIndex
CREATE INDEX "CargoBox_packageId_idx" ON "CargoBox"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "CargoBox_cargoId_sequence_key" ON "CargoBox"("cargoId", "sequence");

-- CreateIndex
CREATE INDEX "ScanEvent_boxId_createdAt_idx" ON "ScanEvent"("boxId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanEvent_cargoId_createdAt_idx" ON "ScanEvent"("cargoId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanEvent_createdAt_idx" ON "ScanEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "CargoBox" ADD CONSTRAINT "CargoBox_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoBox" ADD CONSTRAINT "CargoBox_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CargoPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "CargoBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- One box row per physical box on every live package line, numbered across the
-- consignment in line order. A line of one box keeps the code already printed
-- on its sticker, so labels in circulation still scan to exactly that box; a
-- line of many gets a fresh code per box and needs its labels reprinted.
-- Codes are random (gen_random_uuid is cryptographically random), prefixed
-- SWQ like every other label code.
-- ---------------------------------------------------------------------------
INSERT INTO "CargoBox" ("id", "cargoId", "packageId", "sequence", "qrToken", "createdAt", "updatedAt")
SELECT
  'box' || replace(gen_random_uuid()::text, '-', ''),
  p."cargoId",
  p."id",
  row_number() OVER (PARTITION BY p."cargoId" ORDER BY p."reference", g.n),
  CASE
    WHEN p."quantity" = 1 THEN p."qrToken"
    ELSE 'SWQ' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  END,
  p."createdAt",
  CURRENT_TIMESTAMP
FROM "CargoPackage" p
CROSS JOIN LATERAL generate_series(1, GREATEST(p."quantity", 1)) AS g(n)
WHERE p."deletedAt" IS NULL;

-- Consignments Dar has already checked in: their boxes arrived with them.
UPDATE "CargoBox" b
SET "darReceivedAt" = d."receivedAt", "darReceivedById" = d."receivedById", "darContainerId" = d."containerId"
FROM "DarReceiving" d
WHERE d."cargoId" = b."cargoId";

-- Consignments already handed over: their boxes went with them.
UPDATE "CargoBox" b
SET "collectedAt" = r."releasedAt", "collectedById" = r."releasedById"
FROM "Release" r
WHERE r."cargoId" = b."cargoId";
