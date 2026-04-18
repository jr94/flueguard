CREATE TABLE IF NOT EXISTS `device_firmware_updates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `device_id` INT NOT NULL,
  `request_id` VARCHAR(100) NOT NULL,
  `target_version` VARCHAR(50) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `sha256` VARCHAR(100) NOT NULL,
  `size_bytes` INT NOT NULL,
  `mandatory` TINYINT(1) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `status` ENUM('pending', 'completed', 'failed', 'canceled') NOT NULL DEFAULT 'pending',
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `IDX_request_id` (`request_id`),
  INDEX `IDX_device_id_status` (`device_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
