import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceSettingsService } from './device-settings.service';
import { DeviceSettingsController } from './device-settings.controller';
import { DeviceSetting } from './entities/device-setting.entity';
import { DevicesModule } from '../devices/devices.module';
import { DeviceFirmwareUpdatesModule } from '../device-firmware-updates/device-firmware-updates.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceSetting]),
    DevicesModule,
    DeviceFirmwareUpdatesModule,
    SubscriptionsModule,
  ],
  controllers: [DeviceSettingsController],
  providers: [DeviceSettingsService],
  exports: [DeviceSettingsService],
})
export class DeviceSettingsModule {}
