-- Container costs are their own list (the owner's). Inside a container only
-- these are offered; everything else is a general (business) expense.
ALTER TABLE "ExpenseType" ADD COLUMN "forContainer" BOOLEAN NOT NULL DEFAULT false;

-- The container list. A name already on file joins it; the rest are added.
-- Expenses already recorded keep the type they were recorded under.
INSERT INTO "ExpenseType" ("id", "name", "active", "forContainer", "createdAt")
SELECT 'ctype_' || md5(n), n, true, true, NOW()
FROM unnest(ARRAY[
  'Bill of Lading Fees', 'Chassis Rental', 'Customs Clearance', 'Demurrage', 'Detention',
  'Documentation', 'Facilitation', 'Fuel Surcharge', 'Handling Fees', 'Insurance',
  'Maintenance & Repairs', 'Port Charges', 'Security Fees', 'Storage Fees',
  'Terminal Handling Charges (THC)', 'Transportation', 'Unloading Fee', 'Wharfage'
]) AS n
ON CONFLICT ("name") DO UPDATE SET "forContainer" = true, "active" = true;
