-- A line's carton count corrected while Guangzhou held the cargo left China's
-- receiving count at the old figure (the sync ran only on a volume change).
-- Put each such count back in step with its lines — only for cargo not yet
-- checked in at Dar, whose receiving figures are Dar's to keep — writing the
-- old value to FieldChange first, as every correction does.

WITH lines AS (
  SELECT "cargoId", SUM("quantity")::int AS q
  FROM "CargoPackage"
  WHERE "deletedAt" IS NULL
  GROUP BY "cargoId"
), stale AS (
  SELECT cr."id", cr."packagesCount" AS old, l.q AS new
  FROM "ChinaReceiving" cr
  JOIN lines l ON l."cargoId" = cr."cargoId"
  JOIN "Cargo" c ON c."id" = cr."cargoId"
  LEFT JOIN "DarReceiving" d ON d."cargoId" = cr."cargoId"
  WHERE d."id" IS NULL AND c."deletedAt" IS NULL AND cr."packagesCount" <> l.q
)
INSERT INTO "FieldChange" ("id", "entity", "entityId", "field", "oldValue", "newValue", "reason", "createdAt")
SELECT gen_random_uuid()::text, 'ChinaReceiving', "id", 'packagesCount', old::text, new::text,
       'Count brought back in line with the corrected package lines', now()
FROM stale;

UPDATE "ChinaReceiving" cr
SET "packagesCount" = l.q
FROM (
  SELECT "cargoId", SUM("quantity")::int AS q
  FROM "CargoPackage"
  WHERE "deletedAt" IS NULL
  GROUP BY "cargoId"
) l, "Cargo" c
WHERE l."cargoId" = cr."cargoId"
  AND c."id" = cr."cargoId"
  AND c."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "DarReceiving" d WHERE d."cargoId" = cr."cargoId")
  AND cr."packagesCount" <> l.q;
