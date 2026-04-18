import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceFirmwareUpdatesService } from './device-firmware-updates.service';
import { DeviceFirmwareUpdatesController } from './device-firmware-updates.controller';
import { DeviceFirmwareUpdate } from './entities/device-firmware-update.entity';
import { DevicesModule } from '../devices/devices.module';
import { FirmwareModule } from '../firmware/firmware.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceFirmwareUpdate]),
    DevicesModule,
    FirmwareModule
  ],
  controllers: [DeviceFirmwareUpdatesController],
  providers: [DeviceFirmwareUpdatesService],
  exports: [DeviceFirmwareUpdatesService]
})
export class DeviceFirmwareUpdatesModule {}
