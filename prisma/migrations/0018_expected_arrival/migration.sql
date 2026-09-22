-- THE PROMISE, GIVEN TO BOXES THAT SAILED BEFORE THERE WAS ONE.
--
-- From today a departure writes the expected arrival itself: thirty-five days
-- at sea on this lane (lib/eta.ts). Containers already on the water left before
-- that existed and carry no date, so the page that now shows "expected arrival"
-- would show nothing for exactly the sailings anybody is asking about.
--
-- Only where nobody typed one — a date a person entered is theirs and is left
-- alone — and only for a box that has actually left. A landed container is not
-- touched: its arrival is a fact, not a promise.
UPDATE "Shipment"
SET "eta" = "departureDate" + INTERVAL '35 days'
WHERE "eta" IS NULL
  AND "departureDate" IS NOT NULL
  AND "actualArrival" IS NULL;

-- Written down like any other field that moves, so a date this system worked
-- out is never mistaken for one a person gave us.
INSERT INTO "FieldChange" ("id", "entity", "entityId", "field", "oldValue", "newValue", "reason", "createdAt")
SELECT
  'fc_eta_' || md5(s."id"),
  'Shipment',
  s."id",
  'eta',
  NULL,
  to_char(s."eta", 'YYYY-MM-DD'),
  '35 days at sea from departure',
  NOW()
FROM "Shipment" s
WHERE s."eta" = s."departureDate" + INTERVAL '35 days'
  AND s."actualArrival" IS NULL;
