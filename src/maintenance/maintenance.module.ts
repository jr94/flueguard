import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { Device } from '../devices/entities/device.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { DeviceFirmwareUpdate } from '../device-firmware-updates/entities/device-firmware-update.entity';
import { DevicePushToken } from '../push-tokens/entities/device-push-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, TemperatureLog, Alert, DeviceFirmwareUpdate, DevicePushToken]),
    SubscriptionsModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
