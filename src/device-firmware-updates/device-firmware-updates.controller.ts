import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { DeviceFirmwareUpdatesService } from './device-firmware-updates.service';
import { RequestOtaDto } from './dto/request-ota.dto';
import { CompleteOtaDto } from './dto/complete-ota.dto';
import { FailOtaDto } from './dto/fail-ota.dto';
import { CancelOtaDto } from './dto/cancel-ota.dto';
// Using JwtAuthGuard since app manages OTA requests
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Esp32AuthGuard } from '../auth/guards/esp32-auth.guard';

@Controller('device-firmware-updates')
export class DeviceFirmwareUpdatesController {
  constructor(private readonly deviceFirmwareUpdatesService: DeviceFirmwareUpdatesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('request')
  requestOta(@Body() dto: RequestOtaDto, @Req() req: any) {
    return this.deviceFirmwareUpdatesService.requestOta(dto, req.user.id);
  }

  @UseGuards(Esp32AuthGuard)
  @Post('complete')
  completeOta(@Body() dto: CompleteOtaDto) {
    return this.deviceFirmwareUpdatesService.completeOta(dto);
  }

  @UseGuards(Esp32AuthGuard)
  @Post('fail')
  failOta(@Body() dto: FailOtaDto) {
    return this.deviceFirmwareUpdatesService.failOta(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cancel')
  cancelOta(@Body() dto: CancelOtaDto, @Req() req: any) {
    return this.deviceFirmwareUpdatesService.cancelOta(dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending')
  getAllPendingOtas() {
    return this.deviceFirmwareUpdatesService.getAllPendingOtas();
  }
}
