import { Controller, Get, Put, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('device/:deviceId')
  findByDeviceId(@Param('deviceId', ParseIntPipe) deviceId: number) {
    return this.alertsService.findByDeviceId(deviceId);
  }

  @Put(':id/read')
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.alertsService.markAsRead(id);
  }
}
