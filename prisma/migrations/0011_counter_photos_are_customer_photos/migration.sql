-- The Guangzhou counter's photographs were filed as receiving evidence, a kind
-- customers are never shown, so nobody tracking their cargo saw the pictures
-- the floor had taken for them. The counter is the only place that kind was
-- ever written from China, so every one of them is a photograph of the boxes
-- and becomes the customer-visible package photo.
UPDATE "CargoPhoto"
SET kind = 'PACKAGE'
WHERE kind = 'RECEIVING_EVIDENCE' AND "warehouseKind" = 'CHINA';
