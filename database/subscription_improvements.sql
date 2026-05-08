-- Add unique index to prevent more than one active subscription per device
-- This ensures that for a given device_id, there's only one row with status = 'active'
-- Since MySQL doesn't support conditional indices easily, we can use a generated column for MySQL 8.0+
-- or just rely on backend validation. 
-- However, a common trick for "unique only when status=active" is to use a generated column.

ALTER TABLE device_subscriptions 
ADD COLUMN active_device_unique INT AS (IF(status = 'active', device_id, NULL)) VIRTUAL;

CREATE UNIQUE INDEX idx_device_active_unique ON device_subscriptions(active_device_unique);

-- Note: if your MySQL version is older than 5.7.6, you might need a different approach.
-- For TypeORM, it's safer to handle this in the application logic as well.
