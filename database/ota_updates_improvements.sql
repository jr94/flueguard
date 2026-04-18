-- Add firmware_version to devices table
ALTER TABLE `devices` ADD COLUMN `firmware_version` VARCHAR(50) NULL AFTER `ip_address`;
