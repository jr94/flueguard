import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { SystemMaintenanceService } from './system-maintenance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('maintenance')
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly systemMaintenanceService: SystemMaintenanceService,
  ) {}

  @Post('run-cleanup')
  async runCleanup() {
    return this.systemMaintenanceService.runCleanup();
  }

  @Get('device/:deviceId')
  async getStatus(@Param('deviceId', ParseIntPipe) deviceId: number, @Req() req: any) {
    return this.maintenanceService.getStatus(deviceId, req.user.id);
  }

  @Post('device/:deviceId/reset')
  async reset(@Param('deviceId', ParseIntPipe) deviceId: number, @Req() req: any) {
    return this.maintenanceService.resetMaintenance(deviceId, req.user.id);
  }

  @Put('device/:deviceId/threshold')
  async updateThreshold(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body('threshold_hours', ParseIntPipe) thresholdHours: number,
    @Req() req: any,
  ) {
    return this.maintenanceService.updateThreshold(deviceId, thresholdHours, req.user.id);
  }
}
