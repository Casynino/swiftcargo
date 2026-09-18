-- CreateEnum
CREATE TYPE "SailingStatus" AS ENUM ('OPEN_FOR_BOOKING', 'CUTOFF_APPROACHING', 'CLOSED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'DELAYED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingType" ADD VALUE 'SPECIAL_CARGO';
ALTER TYPE "BookingType" ADD VALUE 'CUSTOMS_CLEARANCE';

-- AlterTable
ALTER TABLE "ContainerBooking" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedCustomerId" TEXT,
ADD COLUMN     "declaredValue" DECIMAL(14,2),
ADD COLUMN     "declaredValueCurrency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "fragile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "handling" TEXT,
ADD COLUMN     "originCity" TEXT,
ADD COLUMN     "perishable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portOfDischarge" TEXT,
ADD COLUMN     "preferredSailingWeek" DATE,
ADD COLUMN     "quotedAmount" DECIMAL(14,2),
ADD COLUMN     "quotedAt" TIMESTAMP(3),
ADD COLUMN     "quotedCurrency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "readinessDate" TIMESTAMP(3),
ADD COLUMN     "shipmentRef" TEXT,
ADD COLUMN     "supplierName" TEXT;

-- AlterTable
ALTER TABLE "PickupRequest" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "cargoId" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactWhatsapp" TEXT,
ADD COLUMN     "estimatedCbm" DECIMAL(12,4),
ADD COLUMN     "estimatedWeightKg" DECIMAL(12,3),
ADD COLUMN     "scheduledDate" TIMESTAMP(3),
ADD COLUMN     "shippingMark" TEXT,
ADD COLUMN     "supplierContact" TEXT,
ADD COLUMN     "supplierName" TEXT;

-- AlterTable
-- The sailing a customer reads is now generated from the weekly rule; a row
-- here is the week that differs from it. The closing date was never written by
-- anything and becomes the day the box is packed, which is what the page shows.
ALTER TABLE "ShipmentSchedule" RENAME COLUMN "closingDate" TO "loadingDate";
ALTER TABLE "ShipmentSchedule" ADD COLUMN     "transitDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "weekOf" DATE;

-- A published sailing's status becomes its booking window. Carried across
-- rather than dropped: a sailing already at sea must not reappear as open.
ALTER TABLE "ShipmentSchedule" ADD COLUMN "sailingStatus" "SailingStatus" NOT NULL DEFAULT 'OPEN_FOR_BOOKING';
UPDATE "ShipmentSchedule" SET "sailingStatus" = CASE "status"::text
  WHEN 'DEPARTED_CHINA' THEN 'DEPARTED'::"SailingStatus"
  WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT'::"SailingStatus"
  WHEN 'PREPARING' THEN 'OPEN_FOR_BOOKING'::"SailingStatus"
  WHEN 'READY' THEN 'CLOSED'::"SailingStatus"
  ELSE 'ARRIVED'::"SailingStatus"
END;
ALTER TABLE "ShipmentSchedule" DROP COLUMN "status";
ALTER TABLE "ShipmentSchedule" RENAME COLUMN "sailingStatus" TO "status";

-- CreateTable
CREATE TABLE "RequestDocument" (
    "id" TEXT NOT NULL,
    "pickupRequestId" TEXT,
    "bookingId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "label" TEXT,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestDocument_pickupRequestId_idx" ON "RequestDocument"("pickupRequestId");

-- CreateIndex
CREATE INDEX "RequestDocument_bookingId_idx" ON "RequestDocument"("bookingId");

-- CreateIndex
CREATE INDEX "ContainerBooking_assignedToId_status_idx" ON "ContainerBooking"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "PickupRequest_assignedToId_status_idx" ON "PickupRequest"("assignedToId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentSchedule_weekOf_key" ON "ShipmentSchedule"("weekOf");

-- AddForeignKey
ALTER TABLE "ContainerBooking" ADD CONSTRAINT "ContainerBooking_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBooking" ADD CONSTRAINT "ContainerBooking_convertedCustomerId_fkey" FOREIGN KEY ("convertedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_pickupRequestId_fkey" FOREIGN KEY ("pickupRequestId") REFERENCES "PickupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ContainerBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

