import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { SystemMaintenanceService } from './system-maintenance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly systemMaintenanceService: SystemMaintenanceService,
  ) {}

  @Post('run-cleanup')
  async runCleanup(@Headers('authorization') authHeader: string) {
    const expectedToken = 'token-clean-123456789';
    // Permitir el token tanto enviándolo directamente o como Bearer token
    if (
      !authHeader ||
      (authHeader !== expectedToken && authHeader !== `Bearer ${expectedToken}`)
    ) {
      throw new UnauthorizedException('Invalid or missing generic token');
    }
    return this.systemMaintenanceService.runCleanup();
  }

  @Get('device/:deviceId')
  @UseGuards(JwtAuthGuard)
  async getStatus(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any,
  ) {
    return this.maintenanceService.getStatus(deviceId, req.user.id);
  }

  @Post('device/:deviceId/reset')
  @UseGuards(JwtAuthGuard)
  async reset(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any,
  ) {
    return this.maintenanceService.resetMaintenance(deviceId, req.user.id);
  }

  @Put('device/:deviceId/threshold')
  @UseGuards(JwtAuthGuard)
  async updateThreshold(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body('threshold_hours', ParseIntPipe) thresholdHours: number,
    @Req() req: any,
  ) {
    return this.maintenanceService.updateThreshold(
      deviceId,
      thresholdHours,
      req.user.id,
    );
  }
}
