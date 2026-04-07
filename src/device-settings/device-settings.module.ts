import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceSettingsService } from './device-settings.service';
import { DeviceSettingsController } from './device-settings.controller';
import { DeviceSetting } from './entities/device-setting.entity';
import { DevicesModule } from '../devices/devices.module';
import { UserDeviceNotification } from '../devices/entities/user-device-notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceSetting, UserDeviceNotification]), DevicesModule],
  controllers: [DeviceSettingsController],
  providers: [DeviceSettingsService],
  exports: [DeviceSettingsService],
})
export class DeviceSettingsModule {}
