import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { TemperatureLog } from './entities/temperature-log.entity';
import { DevicesModule } from '../devices/devices.module';
import { DeviceSettingsModule } from '../device-settings/device-settings.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TemperatureLog]),
    DevicesModule,
    DeviceSettingsModule,
    AlertsModule,
    PushNotificationsModule,
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
