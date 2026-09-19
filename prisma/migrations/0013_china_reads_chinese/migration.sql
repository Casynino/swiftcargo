-- The Guangzhou desk opens in Chinese. Existing China Warehouse accounts still
-- on the English default are moved to Chinese; each can switch back with one
-- press, and whatever they choose from then on is kept.
UPDATE "User" SET locale = 'zh' WHERE role = 'CHINA_WAREHOUSE' AND locale = 'en';
