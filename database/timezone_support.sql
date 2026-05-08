-- Timezone handling for device_settings
ALTER TABLE device_settings
ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'America/Santiago';

UPDATE device_settings
SET timezone = 'America/Santiago'
WHERE timezone IS NULL OR timezone = '';
