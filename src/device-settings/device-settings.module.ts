import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceSettingsService } from './device-settings.service';
import { DeviceSettingsController } from './device-settings.controller';
import { DeviceSetting } from './entities/device-setting.entity';
import { DevicesModule } from '../devices/devices.module';
import { DeviceFirmwareUpdatesModule } from '../device-firmware-updates/device-firmware-updates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceSetting]), 
    DevicesModule,
    DeviceFirmwareUpdatesModule
  ],
  controllers: [DeviceSettingsController],
  providers: [DeviceSettingsService],
  exports: [DeviceSettingsService],
})
export class DeviceSettingsModule {}
