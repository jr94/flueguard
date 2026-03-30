import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceSettingsService } from './device-settings.service';
import { DeviceSettingsController } from './device-settings.controller';
import { DeviceSetting } from './entities/device-setting.entity';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceSetting]), DevicesModule],
  controllers: [DeviceSettingsController],
  providers: [DeviceSettingsService],
  exports: [DeviceSettingsService],
})
export class DeviceSettingsModule {}
