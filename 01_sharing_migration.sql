-- 1. Create pivot table for device sharing
CREATE TABLE IF NOT EXISTS `device_shares_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `can_edit_settings` tinyint(1) NOT NULL DEFAULT '0',
  `can_silence_alarm` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_device_user_share` (`device_id`,`user_id`),
  CONSTRAINT `fk_share_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_share_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2. Create user device notification preferences
CREATE TABLE IF NOT EXISTS `user_device_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `notifications_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_device_user_notif` (`device_id`,`user_id`),
  CONSTRAINT `fk_notif_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. Migrate existing notifications data from device_settings if needed
INSERT INTO `user_device_notifications` (`device_id`, `user_id`, `notifications_enabled`)
SELECT ds.`device_id`, d.`user_id`, ds.`notifications_enabled`
FROM `device_settings` ds
JOIN `devices` d ON d.id = ds.device_id
ON DUPLICATE KEY UPDATE `notifications_enabled` = VALUES(`notifications_enabled`);


-- 4. Delete user_id from device_settings table
-- Depending on existing foreign keys you may need to drop the FK before dropping the column.
-- First check if fk constraint exists: 
-- In MySQL: ALTER TABLE `device_settings` DROP FOREIGN KEY `YOUR_FK_NAME`; 
-- Below assumes the column dropping is direct or no enforced constraint blocks us.
-- ALTER TABLE `device_settings` DROP FOREIGN KEY `FK_device_settings_user_id`; -- adjust exact name
ALTER TABLE `device_settings` DROP COLUMN `user_id`;

-- 5. Delete notifications_enabled from device_settings table
ALTER TABLE `device_settings` DROP COLUMN `notifications_enabled`;
