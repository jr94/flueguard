import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalDashboardService } from './portal-dashboard.service';

@Controller('portal/dashboard')
@UseGuards(JwtAuthGuard)
export class PortalDashboardController {
  constructor(
    private readonly portalDashboardService: PortalDashboardService,
  ) {}

  /**
   * GET /api/portal/dashboard/metrics
   * Returns current totals and monthly series for the admin dashboard.
   * Requires valid JWT (portal session).
   */
  @Get('metrics')
  getDashboardMetrics() {
    return this.portalDashboardService.getDashboardMetrics();
  }
}
