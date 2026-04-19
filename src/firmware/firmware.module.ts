import { Module } from '@nestjs/common';
import { FirmwareController } from './firmware.controller';
import { FirmwareService } from './firmware.service';

@Module({
  controllers: [FirmwareController],
  providers: [FirmwareService],
  exports: [FirmwareService],
})
export class FirmwareModule { }
