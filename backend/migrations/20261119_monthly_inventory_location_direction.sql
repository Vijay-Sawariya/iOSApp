-- Apply once to the shared LMS database before deploying the details endpoint.
ALTER TABLE monthly_inventory_entries
    ADD COLUMN Property_locationUrl VARCHAR(2048) NULL,
    ADD COLUMN building_facing VARCHAR(40) NULL;
