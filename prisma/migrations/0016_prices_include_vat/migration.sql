-- Prices in the rate book now include VAT (the owner's decision).

ALTER TABLE "CompanySetting" ADD COLUMN "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true;

-- Every bill that exists was priced with VAT added on top, and says so.
ALTER TABLE "Invoice" ADD COLUMN "vatInclusive" BOOLEAN NOT NULL DEFAULT false;
-- New bills are priced with VAT inside.
ALTER TABLE "Invoice" ALTER COLUMN "vatInclusive" SET DEFAULT true;

-- Drafts have been shown to nobody: they are restated the new way now, the
-- VAT taken out of the price rather than added to it. Issued, part-paid and
-- paid bills are left exactly as the customer was given them; Finance moves
-- one by re-pricing it, which prices it the new way.
-- Old value first, as every correction is written (actor: the system).
INSERT INTO "FieldChange" ("id", "entity", "entityId", "field", "oldValue", "newValue", "reason", "createdAt")
SELECT 'vatinc_' || "id", 'Invoice', "id", 'total', "total"::text, "subtotal"::text,
       'Prices include VAT: the draft is restated with VAT inside the price, not added on top.', NOW()
FROM "Invoice"
WHERE "status" = 'DRAFT' AND "total" <> "subtotal";

UPDATE "Invoice"
SET "vatInclusive" = true,
    "total"        = "subtotal",
    "vatAmount"    = ROUND("subtotal" * "vatPercent" / (100 + "vatPercent"), 2),
    "totalTzs"     = CASE WHEN "fxRate" IS NULL THEN "totalTzs"
                          ELSE ROUND("subtotal" * "fxRate", 0) END
WHERE "status" = 'DRAFT';
