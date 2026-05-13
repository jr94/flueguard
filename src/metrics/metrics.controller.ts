import { Controller, Get, Post, Param, Query, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetMetricsRangeDto } from './dto/get-metrics-range.dto';
import { GetSessionsRangeDto } from './dto/get-sessions-range.dto';
import { GetReportsRangeDto } from './dto/get-reports-range.dto';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('device/:deviceId/today')
  async getToday(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any,
  ) {
    return this.metricsService.getTodayMetrics(deviceId, req.user.id);
  }

  @Get('device/:deviceId/summary')
  async getSummary(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetMetricsRangeDto,
    @Req() req: any,
  ) {
    return this.metricsService.getSummary(
      deviceId,
      req.user.id,
      query.range,
      query.startDate,
      query.endDate,
    );
  }

  @Get('device/:deviceId/sessions')
  async getSessions(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetSessionsRangeDto,
    @Req() req: any,
  ) {
    return this.metricsService.getSessions(
      deviceId,
      req.user.id,
      query.range,
      query.startDate,
      query.endDate,
    );
  }

  @Get('device/:deviceId/risk-ranking')
  async getRiskRanking(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetMetricsRangeDto,
    @Req() req: any,
  ) {
    return this.metricsService.getRiskRanking(deviceId, req.user.id, query.range);
  }

  @Get('device/:deviceId/predictions')
  async getPredictions(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetMetricsRangeDto,
    @Req() req: any,
  ) {
    return this.metricsService.getPredictionStats(deviceId, req.user.id, query.range);
  }

  @Get('device/:deviceId/reports')
  async getReports(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetReportsRangeDto,
    @Req() req: any,
  ) {
    return this.metricsService.getReports(deviceId, req.user.id, query.type);
  }

  @Post('device/:deviceId/reports/generate')
  async generateReport(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: GetReportsRangeDto,
    @Req() req: any,
  ) {
    return this.metricsService.generateManualReport(deviceId, req.user.id, query.type);
  }

  @Get('device/:deviceId/recalculate')
  async recalculate(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: any,
  ) {
    return this.metricsService.recalculateDailyMetrics(deviceId, req.user.id, startDate, endDate);
  }
}
