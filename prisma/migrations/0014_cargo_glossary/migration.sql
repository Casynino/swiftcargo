-- The goods, in both languages: a glossary learned from lines described in
-- English and Chinese, and a Chinese summary beside each consignment's own.
CREATE TYPE "TermSource" AS ENUM ('SEEDED', 'STAFF', 'MACHINE');

CREATE TABLE "CargoTerm" (
    "id" TEXT NOT NULL,
    "zh" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "source" "TermSource" NOT NULL DEFAULT 'SEEDED',
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CargoTerm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CargoTerm_zh_key" ON "CargoTerm"("zh");
CREATE INDEX "CargoTerm_en_idx" ON "CargoTerm"("en");

ALTER TABLE "Cargo" ADD COLUMN "descriptionZh" TEXT;

-- Seed from every package line the warehouse already described twice. The
-- commonest English for each Chinese term wins.
INSERT INTO "CargoTerm" ("id", "zh", "en", "source", "timesUsed", "createdAt", "updatedAt")
SELECT 'seed_' || md5(zh), zh, en, 'SEEDED', n, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (zh) zh, en, n
  FROM (
    SELECT btrim("descriptionZh") AS zh, btrim("description") AS en, count(*)::int AS n
    FROM "CargoPackage"
    WHERE "descriptionZh" IS NOT NULL AND btrim("descriptionZh") <> ''
      AND "description" IS NOT NULL AND btrim("description") <> ''
      AND btrim("descriptionZh") <> btrim("description")
      AND "description" !~ '[一-鿿]'
    GROUP BY 1, 2
  ) pairs
  ORDER BY zh, n DESC
) best
ON CONFLICT ("zh") DO NOTHING;

-- Each consignment's Chinese summary, from its own first line: the same shape
-- the English summary was written in.
UPDATE "Cargo" c
SET "descriptionZh" = CASE WHEN x.lines > 1 THEN x.zh || ' 等' || x.lines || '项' ELSE x.zh END
FROM (
  SELECT p."cargoId",
         (array_agg(btrim(p."descriptionZh") ORDER BY p."reference"))[1] AS zh,
         count(*) AS lines
  FROM "CargoPackage" p
  WHERE p."deletedAt" IS NULL
  GROUP BY p."cargoId"
) x
WHERE c.id = x."cargoId" AND x.zh IS NOT NULL AND x.zh <> '';
