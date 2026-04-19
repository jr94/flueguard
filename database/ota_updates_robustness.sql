-- Add last_seen_at to device_firmware_updates
ALTER TABLE `device_firmware_updates` ADD COLUMN `last_seen_at` DATETIME(6) NULL AFTER `reason`;
