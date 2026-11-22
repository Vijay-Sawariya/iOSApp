-- Run once on the shared web/iOS database, or load the authenticated web homepage.
ALTER TABLE leads ADD COLUMN construction_stage VARCHAR(64) NULL;
ALTER TABLE monthly_inventory_entries ADD COLUMN construction_stage VARCHAR(64) NULL;
