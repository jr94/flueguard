import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { DeviceMaintenance } from './entities/device-maintenance.entity';
import { DevicesModule } from '../devices/devices.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceMaintenance]),
    DevicesModule,
    AlertsModule,
    PushNotificationsModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
