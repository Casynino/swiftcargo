-- For a short while, changing a bill's category from the collection list wrote
-- the cargo category onto the freight line's own kind, which must only ever be
-- Freight, Charge, Discount, Storage or Other — re-pricing finds freight lines
-- by it. Any line that picked up a category that way is put back to Freight.
UPDATE "InvoiceItem"
SET category = 'Freight'
WHERE unit = 'CBM'
  AND (category IS NULL OR category NOT IN ('Freight', 'Charge', 'Discount', 'Storage', 'Other'));
