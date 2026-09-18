-- Who receives at the warehouse door, for the address a supplier is sent.
ALTER TABLE "Warehouse" ADD COLUMN "contactName" TEXT;

-- The Guangzhou door as the company's own flyer gives it. Filled only where
-- nothing is recorded yet, so a value somebody has already set is kept.
UPDATE "Warehouse"
SET "addressLocal" = CASE
      WHEN "addressLocal" IS NULL OR "addressLocal" = '广州市白云区石井街庆丰庆隆中188号 C1-01'
      THEN '广州市白云区石井街庆丰庆隆中188号C1-01' ELSE "addressLocal" END,
    "phone"        = COALESCE("phone", '17688833885 / 18574434015'),
    "contactName"  = COALESCE("contactName", '黎鹏')
WHERE "code" = 'GZ';
