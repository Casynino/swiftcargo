-- The customs columns of the Guangzhou packing list: net weight, model number
-- and the declared value of one piece in USD. All optional; nothing existing
-- changes.
ALTER TABLE "CargoPackage" ADD COLUMN "netWeightKg" DECIMAL(12,3);
ALTER TABLE "CargoPackage" ADD COLUMN "modelNo" TEXT;
ALTER TABLE "CargoPackage" ADD COLUMN "declaredUnitValue" DECIMAL(14,4);
