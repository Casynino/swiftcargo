-- One customer, one number.
--
-- Every Tanzanian mobile number already on the books is rewritten to the one
-- stored shape (+255 and nine digits) so that the phone sign-in and the counter
-- lookup find it however it was typed years ago. A number that is not a
-- Tanzanian mobile is left exactly as it was: it is flagged on the customer
-- page for the office, never guessed at.

UPDATE "Customer" SET "phone" = '+255' || right(d, 9)
FROM (SELECT id AS cid, regexp_replace("phone", '[^0-9]', '', 'g') AS d FROM "Customer") n
WHERE "Customer".id = n.cid
  AND (n.d ~ '^255[67][0-9]{8}$' OR n.d ~ '^0[67][0-9]{8}$' OR n.d ~ '^[67][0-9]{8}$')
  AND "Customer"."phone" <> '+255' || right(n.d, 9);

UPDATE "Customer" SET "altPhone" = '+255' || right(d, 9)
FROM (SELECT id AS cid, regexp_replace(coalesce("altPhone", ''), '[^0-9]', '', 'g') AS d FROM "Customer") n
WHERE "Customer".id = n.cid
  AND (n.d ~ '^255[67][0-9]{8}$' OR n.d ~ '^0[67][0-9]{8}$' OR n.d ~ '^[67][0-9]{8}$')
  AND "Customer"."altPhone" <> '+255' || right(n.d, 9);

UPDATE "User" SET "phone" = '+255' || right(d, 9)
FROM (SELECT id AS uid, regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') AS d FROM "User") n
WHERE "User".id = n.uid
  AND (n.d ~ '^255[67][0-9]{8}$' OR n.d ~ '^0[67][0-9]{8}$' OR n.d ~ '^[67][0-9]{8}$')
  AND "User"."phone" <> '+255' || right(n.d, 9);

-- The rule itself, for live customers. If two live customers already share a
-- number the index is not created — the deploy must not fail on data only the
-- office can sort out — and the application's own check still refuses a third.
-- The duplicates are listed on the customers page to be merged, after which a
-- later migration adds the index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Customer" WHERE "deletedAt" IS NULL
    GROUP BY "phone" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "Customer_phone_live_key" ON "Customer" ("phone") WHERE "deletedAt" IS NULL;
  END IF;
END $$;
