import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { DeviceMaintenance } from './entities/device-maintenance.entity';
import { DevicesModule } from '../devices/devices.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { SystemMaintenanceService } from './system-maintenance.service';
import { Device } from '../devices/entities/device.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { DeviceFirmwareUpdate } from '../device-firmware-updates/entities/device-firmware-update.entity';
import { DevicePushToken } from '../push-tokens/entities/device-push-token.entity';
import { DevicePredictionMetric } from '../metrics/entities/device-prediction-metric.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceMaintenance,
      Device,
      TemperatureLog,
      Alert,
      DeviceFirmwareUpdate,
      DevicePushToken,
      DevicePredictionMetric,
    ]),
    forwardRef(() => DevicesModule),
    AlertsModule,
    PushNotificationsModule,
    SubscriptionsModule,
    forwardRef(() => MetricsModule),
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, SystemMaintenanceService],
  exports: [MaintenanceService, SystemMaintenanceService],
})
export class MaintenanceModule {}
