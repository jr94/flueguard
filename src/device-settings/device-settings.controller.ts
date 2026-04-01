import { Controller, Get, Put, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DeviceSettingsService } from './device-settings.service';
import { UpdateDeviceSettingDto } from './dto/update-device-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceStaticTokenGuard } from '../auth/guards/device-static-token.guard';

@Controller('device-settings')
export class DeviceSettingsController {
  constructor(private readonly deviceSettingsService: DeviceSettingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':deviceId')
  findByDeviceId(@Param('deviceId', ParseIntPipe) deviceId: number) {
    return this.deviceSettingsService.findByDeviceId(deviceId);
  }

  @UseGuards(DeviceStaticTokenGuard)
  @Get('serial/:serialNumber/user/:userId')
  findBySerialAndUserId(
    @Param('serialNumber') serialNumber: string,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.deviceSettingsService.findBySerialAndUserId(serialNumber, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':deviceId')
  update(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() updateDeviceSettingDto: UpdateDeviceSettingDto,
  ) {
    return this.deviceSettingsService.update(deviceId, updateDeviceSettingDto);
  }
}
