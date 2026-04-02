import { Controller, Post, Body, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { GetTelemetryQueryDto } from './dto/get-telemetry-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post()
  processTelemetry(@Body() createTelemetryDto: CreateTelemetryDto) {
    return this.telemetryService.processTelemetry(createTelemetryDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('device/:deviceId')
  getDeviceTelemetry(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetTelemetryQueryDto,
  ) {
    const hours = query.hours ?? 2;
    return this.telemetryService.getDeviceTelemetry(deviceId, hours);
  }

  @UseGuards(JwtAuthGuard)
  @Get('lastTemp/user/:userId')
  getLastTempForUserDevices(@Param('userId', ParseIntPipe) userId: number) {
    return this.telemetryService.getLastTempForUserDevices(userId);
  }
}
