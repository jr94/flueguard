import { Module } from '@nestjs/common';
import { FirmwareController } from './firmware.controller';
import { FirmwareService } from './firmware.service';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  controllers: [FirmwareController],
  providers: [FirmwareService],
  exports: [FirmwareService],
})
export class FirmwareModule { }
