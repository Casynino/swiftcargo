-- Storage is charged onto the bill automatically past the free days. Finance
-- may take it off; this is what keeps it off.
ALTER TABLE "Invoice" ADD COLUMN "storageWaivedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "storageWaivedReason" TEXT;
