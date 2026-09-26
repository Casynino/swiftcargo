-- WHAT AN OWNER OR DIRECTOR TAKES OUT OF THE BUSINESS, AND WHOSE IT WAS.
--
-- Recording a cost keeps three lists apart: a sailing's kinds, the office's,
-- and an executive's draws. A draw is filed in the name of the person who took
-- it, so each executive's draws can be read back as their own list.

ALTER TABLE "ExpenseType" ADD COLUMN "forExecutive" BOOLEAN NOT NULL DEFAULT false;

-- A kind belongs to one list. A kind flagged as both a sailing's and an
-- executive's would be offered and then refused under every kind of spending.
ALTER TABLE "ExpenseType"
  ADD CONSTRAINT "ExpenseType_one_list" CHECK (NOT ("forContainer" AND "forExecutive"));

ALTER TABLE "ContainerExpense" ADD COLUMN "executiveId" TEXT;
CREATE INDEX "ContainerExpense_executiveId_createdAt_idx" ON "ContainerExpense"("executiveId", "createdAt");
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_executiveId_fkey"
  FOREIGN KEY ("executiveId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The executive's list. Inserted, never updated: a kind of the same name the
-- office already uses keeps its meaning, and nothing already filed moves.
-- Salaries are not here on purpose — they leave only through payroll.
INSERT INTO "ExpenseType" ("id", "name", "active", "forContainer", "forExecutive", "createdAt")
VALUES
  (gen_random_uuid()::text, 'Profit withdrawal',               true, false, true, now()),
  (gen_random_uuid()::text, 'Dividend',                        true, false, true, now()),
  (gen_random_uuid()::text, 'Capital withdrawal',              true, false, true, now()),
  (gen_random_uuid()::text, 'Owner''s drawings',               true, false, true, now()),
  (gen_random_uuid()::text, 'Director''s advance',             true, false, true, now()),
  (gen_random_uuid()::text, 'Loan to a director',              true, false, true, now()),
  (gen_random_uuid()::text, 'Director''s allowance',           true, false, true, now()),
  (gen_random_uuid()::text, 'Business trip',                   true, false, true, now()),
  (gen_random_uuid()::text, 'Sourcing trip to China',          true, false, true, now()),
  (gen_random_uuid()::text, 'Supplier & market visit',         true, false, true, now()),
  (gen_random_uuid()::text, 'Business development',            true, false, true, now()),
  (gen_random_uuid()::text, 'Client entertainment',            true, false, true, now()),
  (gen_random_uuid()::text, 'Business float — to account for', true, false, true, now()),
  (gen_random_uuid()::text, 'School fees',                     true, false, true, now()),
  (gen_random_uuid()::text, 'Family medical',                  true, false, true, now()),
  (gen_random_uuid()::text, 'Household & family support',      true, false, true, now()),
  (gen_random_uuid()::text, 'Personal vehicle & fuel',         true, false, true, now()),
  (gen_random_uuid()::text, 'Personal travel',                 true, false, true, now()),
  (gen_random_uuid()::text, 'Personal airtime & data',         true, false, true, now()),
  (gen_random_uuid()::text, 'Meals & entertainment',           true, false, true, now()),
  (gen_random_uuid()::text, 'Personal rent',                   true, false, true, now()),
  (gen_random_uuid()::text, 'Personal insurance',              true, false, true, now()),
  (gen_random_uuid()::text, 'Contributions & harambee',        true, false, true, now()),
  (gen_random_uuid()::text, 'Gifts & hospitality',             true, false, true, now()),
  (gen_random_uuid()::text, 'Personal purchases',              true, false, true, now())
ON CONFLICT ("name") DO NOTHING;
