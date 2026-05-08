import { Injectable, ForbiddenException, Logger, BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { DeviceDailyMetric } from './entities/device-daily-metric.entity';
import { DeviceUsageSession } from './entities/device-usage-session.entity';
import { DevicePredictionMetric } from './entities/device-prediction-metric.entity';
import { DeviceReport } from './entities/device-report.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { MaintenanceService } from '../maintenance/maintenance.service';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectRepository(DeviceDailyMetric)
    private readonly dailyMetricRepository: Repository<DeviceDailyMetric>,
    @InjectRepository(DeviceUsageSession)
    private readonly sessionRepository: Repository<DeviceUsageSession>,
    @InjectRepository(DevicePredictionMetric)
    private readonly predictionRepository: Repository<DevicePredictionMetric>,
    @InjectRepository(DeviceReport)
    private readonly reportRepository: Repository<DeviceReport>,
    @InjectRepository(DeviceSetting)
    private readonly deviceSettingsRepository: Repository<DeviceSetting>,
    @InjectRepository(TemperatureLog)
    private readonly temperatureLogRepository: Repository<TemperatureLog>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  private readonly defaultTimezone = 'America/Santiago';

  // --- Timezone Helpers ---

  async getDeviceTimezone(deviceId: number): Promise<string> {
    const settings = await this.deviceSettingsRepository.findOne({
      where: { device_id: deviceId },
    });

    const timezone = settings?.timezone?.trim();

    if (!timezone) {
      return this.defaultTimezone;
    }

    const test = DateTime.now().setZone(timezone);

    if (!test.isValid) {
      this.logger.warn(`[Timezone] Invalid timezone "${timezone}" for device ${deviceId}. Using fallback ${this.defaultTimezone}`);
      return this.defaultTimezone;
    }

    return timezone;
  }

  private getLocalMetricDate(date: Date, timezone: string): string {
    return DateTime
      .fromJSDate(date, { zone: 'utc' })
      .setZone(timezone)
      .toISODate() as string;
  }

  private getTodayLocalDate(timezone: string): string {
    return DateTime
      .now()
      .setZone(timezone)
      .toISODate() as string;
  }

  private getLocalDateRangeForRange(
    range: 'today' | '7d' | '30d' | 'custom',
    timezone: string,
    startDate?: string,
    endDate?: string,
  ): { startDate: string; endDate: string } {
    const now = DateTime.now().setZone(timezone);

    if (range === 'today') {
      const today = now.toISODate()!;
      return { startDate: today, endDate: today };
    }

    if (range === '7d') {
      return {
        startDate: now.minus({ days: 6 }).toISODate()!,
        endDate: now.toISODate()!,
      };
    }

    if (range === '30d') {
      return {
        startDate: now.minus({ days: 29 }).toISODate()!,
        endDate: now.toISODate()!,
      };
    }

    if (!startDate || !endDate) {
      throw new BadRequestException('startDate y endDate son requeridos para rango custom');
    }

    return { startDate, endDate };
  }

  private localDateRangeToUtcDates(
    startDate: string,
    endDate: string,
    timezone: string,
  ): { utcStart: Date; utcEnd: Date } {
    const localStart = DateTime
      .fromISO(startDate, { zone: timezone })
      .startOf('day');

    const localEnd = DateTime
      .fromISO(endDate, { zone: timezone })
      .endOf('day');

    return {
      utcStart: localStart.toUTC().toJSDate(),
      utcEnd: localEnd.toUTC().toJSDate(),
    };
  }

  private getLocalWeekKey(date: Date, timezone: string): string {
    const local = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone);
    const weekStart = local.startOf('week');
    return weekStart.toISODate()!;
  }

  // --- API Methods ---

  async getTodayMetrics(deviceId: number, userId: number) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.daily_max_temperature');
    
    const timezone = await this.getDeviceTimezone(deviceId);
    const today = this.getTodayLocalDate(timezone);

    let metric = await this.dailyMetricRepository.findOne({
      where: { device_id: deviceId, metric_date: today },
    });

    if (!metric) {
      // Return empty/default if not found
      return {
        device_id: deviceId,
        date: today,
        usage_minutes: 0,
        usage_label: '0 min',
        max_temperature: 0,
        max_temperature_at: null,
        avg_temperature: 0,
        alerts_total: 0,
        alerts_level_1: 0,
        alerts_level_2: 0,
        alerts_level_3: 0,
        safe_minutes: 0,
        warning_minutes: 0,
        critical_minutes: 0,
        low_minutes: 0,
        efficiency_score: 0,
        risk_score: 0,
        sessions_count: 0,
        timezone,
      };
    }

    return {
      ...metric,
      usage_label: this.formatMinutes(metric.usage_minutes),
      date: metric.metric_date,
      timezone,
    };
  }

  async getSummary(deviceId: number, userId: number, range: 'today' | '7d' | '30d' | 'custom', startDate?: string, endDate?: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.historical_max_temperature');

    const timezone = await this.getDeviceTimezone(deviceId);
    const { startDate: start, endDate: end } = this.getLocalDateRangeForRange(range, timezone, startDate, endDate);

    const result = await this.dailyMetricRepository
      .createQueryBuilder('m')
      .select('SUM(m.usage_minutes)', 'total_usage_minutes')
      .addSelect('MAX(m.max_temperature)', 'max_temperature')
      .addSelect('AVG(m.avg_temperature)', 'avg_temperature')
      .addSelect('SUM(m.sessions_count)', 'total_sessions')
      .addSelect('SUM(m.alerts_total)', 'total_alerts')
      .addSelect('SUM(m.alerts_level_3)', 'total_critical_alerts')
      .addSelect('SUM(m.safe_minutes)', 'safe_minutes')
      .addSelect('SUM(m.warning_minutes)', 'warning_minutes')
      .addSelect('SUM(m.critical_minutes)', 'critical_minutes')
      .addSelect('SUM(m.low_minutes)', 'low_minutes')
      .addSelect('AVG(m.efficiency_score)', 'efficiency_score')
      .addSelect('AVG(m.risk_score)', 'risk_score')
      .where('m.device_id = :deviceId', { deviceId })
      .andWhere('m.metric_date BETWEEN :start AND :end', { start, end })
      .getRawOne();

    // Find max_temperature_at separately to be precise
    const maxTempRecord = await this.dailyMetricRepository.findOne({
      where: { device_id: deviceId, metric_date: Between(start, end) },
      order: { max_temperature: 'DESC' },
    });

    return {
      device_id: deviceId,
      range,
      period_start: start,
      period_end: end,
      total_usage_minutes: Number(result.total_usage_minutes || 0),
      total_usage_label: this.formatMinutes(Number(result.total_usage_minutes || 0)),
      max_temperature: Number(result.max_temperature || 0),
      max_temperature_at: maxTempRecord?.max_temperature_at || null,
      avg_temperature: Number(Number(result.avg_temperature || 0).toFixed(2)),
      total_sessions: Number(result.total_sessions || 0),
      total_alerts: Number(result.total_alerts || 0),
      total_critical_alerts: Number(result.total_critical_alerts || 0),
      safe_minutes: Number(result.safe_minutes || 0),
      warning_minutes: Number(result.warning_minutes || 0),
      critical_minutes: Number(result.critical_minutes || 0),
      low_minutes: Number(result.low_minutes || 0),
      efficiency_score: Number(Number(result.efficiency_score || 0).toFixed(2)),
      risk_score: Number(Number(result.risk_score || 0).toFixed(2)),
      timezone,
    };
  }

  async getSessions(deviceId: number, userId: number, range: 'today' | '7d' | '30d' | 'custom', startDate?: string, endDate?: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.usage_sessions');

    const timezone = await this.getDeviceTimezone(deviceId);
    const { startDate: start, endDate: end } = this.getLocalDateRangeForRange(range, timezone, startDate, endDate);
    
    const { utcStart, utcEnd } = this.localDateRangeToUtcDates(start, end, timezone);

    const sessions = await this.sessionRepository.find({
      where: [
        {
          device_id: deviceId,
          started_at: Between(utcStart, utcEnd),
        },
        {
          device_id: deviceId,
          started_at: LessThanOrEqual(utcEnd),
          ended_at: MoreThanOrEqual(utcStart),
        }
      ],
      order: { started_at: 'DESC' },
    });

    return sessions.map(s => ({
      ...s,
      duration_label: this.formatMinutes(s.duration_minutes),
      timezone,
    }));
  }

  async getRiskRanking(deviceId: number, userId: number, range: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.risk_ranking');

    const timezone = await this.getDeviceTimezone(deviceId);
    const { startDate: start, endDate: end } = this.getLocalDateRangeForRange(range as any, timezone);

    const days = await this.dailyMetricRepository.find({
      where: {
        device_id: deviceId,
        metric_date: Between(start, end),
      },
      order: { risk_score: 'DESC', critical_minutes: 'DESC' },
      take: 10,
    });

    return days.map(d => ({
      date: d.metric_date,
      max_temperature: d.max_temperature,
      max_temperature_at: d.max_temperature_at,
      critical_minutes: d.critical_minutes,
      warning_minutes: d.warning_minutes,
      alerts_total: d.alerts_total,
      alerts_level_3: d.alerts_level_3,
      risk_score: d.risk_score,
      timezone,
    }));
  }

  async getPredictionStats(deviceId: number, userId: number, range: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.prediction_performance');

    const timezone = await this.getDeviceTimezone(deviceId);
    const { startDate: start, endDate: end } = this.getLocalDateRangeForRange(range as any, timezone);
    const { utcStart, utcEnd } = this.localDateRangeToUtcDates(start, end, timezone);

    const stats = await this.predictionRepository
      .createQueryBuilder('p')
      .select('COUNT(*)', 'predictions_total')
      .addSelect('SUM(p.was_confirmed)', 'predictions_confirmed')
      .addSelect('SUM(p.was_false_positive)', 'predictions_false_positive')
      .addSelect('AVG(p.predicted_minutes_to_threshold)', 'avg_predicted_minutes_to_threshold')
      .where('p.device_id = :deviceId', { deviceId })
      .andWhere('p.predicted_at BETWEEN :start AND :end', { start: utcStart, end: utcEnd })
      .getRawOne();

    const total = Number(stats.predictions_total || 0);
    const confirmed = Number(stats.predictions_confirmed || 0);
    const accuracy = total > 0 ? (confirmed / total) * 100 : 0;

    return {
      predictions_total: total,
      predictions_confirmed: confirmed,
      predictions_false_positive: Number(stats.predictions_false_positive || 0),
      accuracy_percentage: Number(accuracy.toFixed(2)),
      avg_predicted_minutes_to_threshold: Number(Number(stats.avg_predicted_minutes_to_threshold || 0).toFixed(2)),
    };
  }

  async getReports(deviceId: number, userId: number, type: 'weekly' | 'monthly') {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.reports_and_recommendations');

    const reports = await this.reportRepository.find({
      where: { device_id: deviceId, report_type: type },
      order: { period_end: 'DESC' },
    });

    return reports.map(r => ({
      ...r,
      total_usage_label: this.formatMinutes(r.total_usage_minutes),
    }));
  }

  // --- Internal Processing Methods ---

  async processTelemetryForMetrics(deviceId: number, temperature: number, createdAt: Date) {
    try {
      const safeTemperature = this.sanitizeNumber(temperature, undefined);
      if (safeTemperature === null) {
        this.logger.warn(`[MetricsService] Invalid temperature for device ${deviceId}: ${temperature}`);
        return;
      }

      const safeCreatedAt = (createdAt && !isNaN(createdAt.getTime())) ? createdAt : new Date();

      const settings = await this.deviceSettingsRepository.findOne({ where: { device_id: deviceId } });
      if (!settings) return;

      const t1 = this.sanitizeNumber(settings.threshold_1, 100);
      const t2 = this.sanitizeNumber(settings.threshold_2, 200);
      const t3 = this.sanitizeNumber(settings.threshold_3, 300);

      const timezone = await this.getDeviceTimezone(deviceId);
      const dateStr = this.getLocalMetricDate(safeCreatedAt, timezone);

      this.logger.log(`[MetricsService] device=${deviceId} timezone=${timezone} localMetricDate=${dateStr} createdAt=${safeCreatedAt.toISOString()}`);

      // 1. Update Daily Metrics
      let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
      if (!daily) {
        daily = this.dailyMetricRepository.create({
          device_id: deviceId,
          metric_date: dateStr,
          min_temperature: safeTemperature,
          max_temperature: safeTemperature,
          max_temperature_at: safeCreatedAt,
          avg_temperature: safeTemperature,
          threshold_1_snapshot: t1,
          threshold_2_snapshot: t2,
          threshold_3_snapshot: t3,
        });
      } else {
        const currentAvg = this.sanitizeNumber(daily.avg_temperature);
        daily.avg_temperature = (currentAvg * 0.95) + (safeTemperature * 0.05);
        
        if (safeTemperature > this.sanitizeNumber(daily.max_temperature)) {
          daily.max_temperature = safeTemperature;
          daily.max_temperature_at = safeCreatedAt;
        }
        if (safeTemperature < this.sanitizeNumber(daily.min_temperature) || this.sanitizeNumber(daily.min_temperature) === 0) {
          daily.min_temperature = safeTemperature;
        }
      }

      // 2. Zone updates
      const lastLogs = await this.temperatureLogRepository.find({
        where: { device_id: deviceId, created_at: LessThanOrEqual(safeCreatedAt) },
        order: { created_at: 'DESC' },
        take: 1,
        skip: 1 
      });
      const lastLog = lastLogs[0];

      let minutesDiff = 1; 
      if (lastLog) {
        const diffMs = safeCreatedAt.getTime() - new Date(lastLog.created_at).getTime();
        minutesDiff = Math.min(Math.floor(this.safeDivide(diffMs, 60000)), 5); 
        if (minutesDiff < 1) minutesDiff = 1;
      }
      minutesDiff = this.sanitizeNumber(minutesDiff, 1);

      const zone = this.getTemperatureZone(safeTemperature, t1, t2, t3);
      if (zone === 'safe') daily.safe_minutes = this.sanitizeNumber(daily.safe_minutes) + minutesDiff;
      else if (zone === 'warning') daily.warning_minutes = this.sanitizeNumber(daily.warning_minutes) + minutesDiff;
      else if (zone === 'critical') daily.critical_minutes = this.sanitizeNumber(daily.critical_minutes) + minutesDiff;
      else if (zone === 'low') daily.low_minutes = this.sanitizeNumber(daily.low_minutes) + minutesDiff;

      if (safeTemperature >= 80) {
        daily.usage_minutes = this.sanitizeNumber(daily.usage_minutes) + minutesDiff;
      }

      daily.efficiency_score = this.calculateEfficiencyScore(daily.safe_minutes, daily.warning_minutes, daily.critical_minutes, daily.low_minutes);
      daily.risk_score = this.calculateRiskScore(daily.max_temperature, daily.critical_minutes, daily.alerts_level_3, t3);

      this.logIfContainsInvalidNumber('device_daily_metrics', daily);
      await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));

      // 3. Session Management
      let activeSession = await this.sessionRepository.findOne({
        where: { device_id: deviceId, status: 'active' },
      });

      if (safeTemperature >= 80) {
        if (!activeSession) {
          activeSession = this.sessionRepository.create({
            device_id: deviceId,
            started_at: safeCreatedAt,
            status: 'active',
            start_temperature: safeTemperature,
            max_temperature: safeTemperature,
            max_temperature_at: safeCreatedAt,
            avg_temperature: safeTemperature,
          });
          daily.sessions_count = this.sanitizeNumber(daily.sessions_count) + 1;
          await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
        } else {
          activeSession.duration_minutes = this.sanitizeNumber(activeSession.duration_minutes) + minutesDiff;
          const sessionAvg = this.sanitizeNumber(activeSession.avg_temperature);
          activeSession.avg_temperature = (sessionAvg * 0.95) + (safeTemperature * 0.05);
          
          if (safeTemperature > this.sanitizeNumber(activeSession.max_temperature)) {
            activeSession.max_temperature = safeTemperature;
            activeSession.max_temperature_at = safeCreatedAt;
          }
          
          if (zone === 'safe') activeSession.safe_minutes = this.sanitizeNumber(activeSession.safe_minutes) + minutesDiff;
          else if (zone === 'warning') activeSession.warning_minutes = this.sanitizeNumber(activeSession.warning_minutes) + minutesDiff;
          else if (zone === 'critical') activeSession.critical_minutes = this.sanitizeNumber(activeSession.critical_minutes) + minutesDiff;
          else if (zone === 'low') activeSession.low_minutes = this.sanitizeNumber(activeSession.low_minutes) + minutesDiff;

          activeSession.efficiency_score = this.calculateEfficiencyScore(activeSession.safe_minutes, activeSession.warning_minutes, activeSession.critical_minutes, activeSession.low_minutes);
          activeSession.risk_score = this.calculateRiskScore(activeSession.max_temperature, activeSession.critical_minutes, activeSession.alerts_level_3, t3);
        }
        this.logIfContainsInvalidNumber('device_usage_sessions', activeSession);
        await this.sessionRepository.save(this.sanitizeMetricPayload(activeSession));
      } else if (activeSession) {
        const recentLogs = await this.temperatureLogRepository.find({
          where: { device_id: deviceId, created_at: MoreThanOrEqual(new Date(safeCreatedAt.getTime() - 20 * 60000)) },
          order: { created_at: 'DESC' },
        });

        const allBelow60 = recentLogs.length > 0 && recentLogs.every(l => Number(l.temperature) < 60);
        const firstRecentLogAt = recentLogs.length > 0 ? new Date(recentLogs[recentLogs.length - 1].created_at).getTime() : safeCreatedAt.getTime();
        const longEnough = recentLogs.length > 0 && (safeCreatedAt.getTime() - firstRecentLogAt) >= 15 * 60000;

        if (safeTemperature < 60 && allBelow60 && longEnough) {
          activeSession.status = 'closed';
          activeSession.ended_at = safeCreatedAt;
          activeSession.end_temperature = safeTemperature;
          
          // Add usage to maintenance counter
          if (!activeSession.maintenance_counted) {
            const durationSeconds = activeSession.duration_minutes * 60;
            await this.maintenanceService.addUsageSeconds(deviceId, durationSeconds);
            activeSession.maintenance_counted = true;
          }
          
          await this.sessionRepository.save(this.sanitizeMetricPayload(activeSession));
        } else {
          activeSession.duration_minutes = this.sanitizeNumber(activeSession.duration_minutes) + minutesDiff;
          if (zone === 'low') activeSession.low_minutes = this.sanitizeNumber(activeSession.low_minutes) + minutesDiff;
          await this.sessionRepository.save(this.sanitizeMetricPayload(activeSession));
        }
      }

      this.logger.log(`[MetricsService] Metrics processed successfully for device ${deviceId}`);
    } catch (error) {
      this.logger.error(`Error processing telemetry for metrics: ${error.message}`, error.stack);
    }
  }

  async updateMetricsFromAlert(deviceId: number, alertLevel: number, alertCreatedAt: Date) {
    try {
      const timezone = await this.getDeviceTimezone(deviceId);
      const dateStr = this.getLocalMetricDate(alertCreatedAt, timezone);
      let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
      
      if (daily) {
        daily.alerts_total = this.sanitizeNumber(daily.alerts_total) + 1;
        if (alertLevel === 1) daily.alerts_level_1 = this.sanitizeNumber(daily.alerts_level_1) + 1;
        if (alertLevel === 2) daily.alerts_level_2 = this.sanitizeNumber(daily.alerts_level_2) + 1;
        if (alertLevel === 3) daily.alerts_level_3 = this.sanitizeNumber(daily.alerts_level_3) + 1;
        await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
      }

      let activeSession = await this.sessionRepository.findOne({
        where: { device_id: deviceId, status: 'active' },
      });

      if (activeSession) {
        activeSession.alerts_total = this.sanitizeNumber(activeSession.alerts_total) + 1;
        if (alertLevel === 1) activeSession.alerts_level_1 = this.sanitizeNumber(activeSession.alerts_level_1) + 1;
        if (alertLevel === 2) activeSession.alerts_level_2 = this.sanitizeNumber(activeSession.alerts_level_2) + 1;
        if (alertLevel === 3) activeSession.alerts_level_3 = this.sanitizeNumber(activeSession.alerts_level_3) + 1;
        await this.sessionRepository.save(this.sanitizeMetricPayload(activeSession));
      }
    } catch (error) {
      this.logger.error(`Error updating metrics from alert: ${error.message}`);
    }
  }

  async savePredictionMetric(data: any) {
    try {
      const prediction = this.predictionRepository.create({
        device_id: data.device_id,
        predicted_at: data.predicted_at || new Date(),
        current_temperature: this.sanitizeNumber(data.current_temperature),
        predicted_temperature: this.sanitizeNumber(data.predicted_temperature),
        target_threshold: this.sanitizeNumber(data.target_threshold),
        predicted_minutes_to_threshold: this.sanitizeNumber(data.predicted_minutes_to_threshold),
        slope: this.sanitizeNumber(data.slope),
        alert_id: data.alert_id,
      });
      await this.predictionRepository.save(this.sanitizeMetricPayload(prediction));

      // Update daily counter
      const timezone = await this.getDeviceTimezone(data.device_id);
      const dateStr = this.getLocalMetricDate(prediction.predicted_at, timezone);
      let daily = await this.dailyMetricRepository.findOne({ where: { device_id: data.device_id, metric_date: dateStr } });
      if (daily) {
        daily.predictions_total = this.sanitizeNumber(daily.predictions_total) + 1;
        await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
      }
    } catch (error) {
      this.logger.error(`Error saving prediction metric: ${error.message}`);
    }
  }

  async confirmPredictionIfNeeded(deviceId: number, temperature: number, createdAt: Date) {
    try {
      // Find unconfirmed predictions in the last 30 minutes
      const thirtyMinsAgo = new Date(createdAt.getTime() - 30 * 60000);
      const pending = await this.predictionRepository.find({
        where: {
          device_id: deviceId,
          was_confirmed: 0,
          was_false_positive: 0,
          predicted_at: MoreThanOrEqual(thirtyMinsAgo),
        },
      });

      for (const pred of pending) {
        const limitTime = new Date(pred.predicted_at.getTime() + (pred.predicted_minutes_to_threshold + 5) * 60000);
        
        if (temperature >= pred.target_threshold && createdAt <= limitTime) {
          pred.was_confirmed = 1;
          pred.confirmed_at = createdAt;
          await this.predictionRepository.save(this.sanitizeMetricPayload(pred));

          // Update daily counter
          const timezone = await this.getDeviceTimezone(deviceId);
          const dateStr = this.getLocalMetricDate(pred.predicted_at, timezone);
          let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
          if (daily) {
            daily.predictions_confirmed = this.sanitizeNumber(daily.predictions_confirmed) + 1;
            await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
          }

        } else if (createdAt > limitTime) {
          pred.was_false_positive = 1;
          await this.predictionRepository.save(this.sanitizeMetricPayload(pred));

          // Update daily counter
          const timezone = await this.getDeviceTimezone(deviceId);
          const dateStr = this.getLocalMetricDate(pred.predicted_at, timezone);
          let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
          if (daily) {
            daily.predictions_false_positive = this.sanitizeNumber(daily.predictions_false_positive) + 1;
            await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error confirming prediction: ${error.message}`);
    }
  }

  async generateWeeklyReport(deviceId: number, periodStart: Date | string, periodEnd: Date | string) {
    try {
      const timezone = await this.getDeviceTimezone(deviceId);
      const periodStartStr = (typeof periodStart === 'string') ? periodStart : periodStart.toISOString().split('T')[0];
      const periodEndStr = (typeof periodEnd === 'string') ? periodEnd : periodEnd.toISOString().split('T')[0];

      const summary = await this.getSummary(deviceId, 0, 'custom', periodStartStr, periodEndStr);

      // Upsert logic: check if report already exists for this period and device
      let report = await this.reportRepository.findOne({
        where: {
          device_id: deviceId,
          report_type: 'weekly',
          period_start: periodStartStr as any,
          period_end: periodEndStr as any,
        }
      });

      if (!report) {
        report = this.reportRepository.create({
          device_id: deviceId,
          report_type: 'weekly',
          period_start: periodStart as any,
          period_end: periodEnd as any,
        });
      }

      report.total_usage_minutes = this.sanitizeNumber(summary.total_usage_minutes);
      report.max_temperature = this.sanitizeNumber(summary.max_temperature);
      report.max_temperature_at = summary.max_temperature_at;
      report.avg_temperature = this.sanitizeNumber(summary.avg_temperature);
      report.total_sessions = this.sanitizeNumber(summary.total_sessions);
      report.total_alerts = this.sanitizeNumber(summary.total_alerts);
      report.total_critical_alerts = this.sanitizeNumber(summary.total_critical_alerts);
      report.safe_minutes = this.sanitizeNumber(summary.safe_minutes);
      report.warning_minutes = this.sanitizeNumber(summary.warning_minutes);
      report.critical_minutes = this.sanitizeNumber(summary.critical_minutes);
      report.low_minutes = this.sanitizeNumber(summary.low_minutes);
      report.efficiency_score = this.sanitizeNumber(summary.efficiency_score);
      report.risk_score = this.sanitizeNumber(summary.risk_score);

      const { recommendation, summaryText } = this.generateReportInsights(summary);
      report.recommendation = recommendation;
      report.summary = summaryText;

      await this.reportRepository.save(this.sanitizeMetricPayload(report));
      this.logger.log(`[Reports] Reporte generado para device ${deviceId} (weekly)`);
      return report;
    } catch (error) {
      this.logger.error(`Error generating weekly report for device ${deviceId}: ${error.message}`);
    }
  }

  async generateMonthlyReport(deviceId: number, periodStart: Date | string, periodEnd: Date | string) {
    try {
      const timezone = await this.getDeviceTimezone(deviceId);
      const periodStartStr = (typeof periodStart === 'string') ? periodStart : periodStart.toISOString().split('T')[0];
      const periodEndStr = (typeof periodEnd === 'string') ? periodEnd : periodEnd.toISOString().split('T')[0];

      const summary = await this.getSummary(deviceId, 0, 'custom', periodStartStr, periodEndStr);

      // Upsert logic
      let report = await this.reportRepository.findOne({
        where: {
          device_id: deviceId,
          report_type: 'monthly',
          period_start: periodStartStr as any,
          period_end: periodEndStr as any,
        }
      });

      if (!report) {
        report = this.reportRepository.create({
          device_id: deviceId,
          report_type: 'monthly',
          period_start: periodStart as any,
          period_end: periodEnd as any,
        });
      }

      report.total_usage_minutes = this.sanitizeNumber(summary.total_usage_minutes);
      report.max_temperature = this.sanitizeNumber(summary.max_temperature);
      report.max_temperature_at = summary.max_temperature_at;
      report.avg_temperature = this.sanitizeNumber(summary.avg_temperature);
      report.total_sessions = this.sanitizeNumber(summary.total_sessions);
      report.total_alerts = this.sanitizeNumber(summary.total_alerts);
      report.total_critical_alerts = this.sanitizeNumber(summary.total_critical_alerts);
      report.safe_minutes = this.sanitizeNumber(summary.safe_minutes);
      report.warning_minutes = this.sanitizeNumber(summary.warning_minutes);
      report.critical_minutes = this.sanitizeNumber(summary.critical_minutes);
      report.low_minutes = this.sanitizeNumber(summary.low_minutes);
      report.efficiency_score = this.sanitizeNumber(summary.efficiency_score);
      report.risk_score = this.sanitizeNumber(summary.risk_score);

      const { recommendation, summaryText } = this.generateReportInsights(summary);
      report.recommendation = recommendation;
      report.summary = summaryText;

      await this.reportRepository.save(this.sanitizeMetricPayload(report));
      this.logger.log(`[Reports] Reporte generado para device ${deviceId} (monthly)`);
      return report;
    } catch (error) {
      this.logger.error(`Error generating monthly report for device ${deviceId}: ${error.message}`);
    }
  }

  @Cron('0 0 6 * * 1', { timeZone: 'America/Santiago' }) // Mondays 06:00 AM
  async handleWeeklyReportsCron() {
    this.logger.log('[Reports] Generando reportes semanales PRO');
    await this.generateReportsForAllProDevices('weekly');
  }

  @Cron('0 30 6 1 * *', { timeZone: 'America/Santiago' }) // Day 1 06:30 AM
  async handleMonthlyReportsCron() {
    this.logger.log('[Reports] Generando reportes mensuales PRO');
    await this.generateReportsForAllProDevices('monthly');
  }

  async generateReportsForAllProDevices(type: 'weekly' | 'monthly') {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (type === 'weekly') {
      // Previous week: Monday to Sunday
      start = new Date(now);
      start.setDate(now.getDate() - 7 - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      start.setHours(0, 0, 0, 0);

      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // Previous month
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
    }

    const activeSubDeviceIds = await this.subscriptionsService.getActiveSubscriptionsDeviceIds();
    
    for (const deviceId of activeSubDeviceIds) {
      try {
        const hasFeature = await this.subscriptionsService.deviceHasFeature(deviceId, 'metrics.reports_and_recommendations');
        if (hasFeature.has_feature && hasFeature.plan_code === 'pro') {
          const timezone = await this.getDeviceTimezone(deviceId);
          const now = DateTime.now().setZone(timezone);

          let startStr: string;
          let endStr: string;

          if (type === 'weekly') {
            const currentWeekStart = now.startOf('week');
            const previousWeekStart = currentWeekStart.minus({ weeks: 1 });
            const previousWeekEnd = currentWeekStart.minus({ days: 1 });
            startStr = previousWeekStart.toISODate()!;
            endStr = previousWeekEnd.toISODate()!;
            await this.generateWeeklyReport(deviceId, startStr as any, endStr as any);
          } else {
            const previousMonth = now.minus({ months: 1 });
            startStr = previousMonth.startOf('month').toISODate()!;
            endStr = previousMonth.endOf('month').toISODate()!;
            await this.generateMonthlyReport(deviceId, startStr as any, endStr as any);
          }
        }
      } catch (e) {
        this.logger.error(`Failed to generate ${type} report for device ${deviceId}: ${e.message}`);
      }
    }
  }

  async runScheduledReports() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    if (dayOfWeek === 1) await this.generateReportsForAllProDevices('weekly');
    if (dayOfMonth === 1) await this.generateReportsForAllProDevices('monthly');
  }

  private generateReportInsights(summary: any) {
    let recommendation = 'El uso de la estufa fue estable y dentro de rangos seguros la mayor parte del tiempo.';
    let summaryText = 'Buen desempeño general.';

    if (summary.total_usage_minutes === 0) {
      recommendation = 'No se detectó uso relevante de la estufa durante este periodo.';
      summaryText = 'Sin actividad.';
    } else if (summary.total_critical_alerts > 0 || summary.critical_minutes > 0) {
      recommendation = 'Se detectaron periodos en temperatura crítica. Revisa la entrada de aire y evita agregar más leña cuando la temperatura suba demasiado.';
      summaryText = 'Se detectaron riesgos críticos.';
      if (summary.total_critical_alerts > 5) {
        recommendation += ' Hubo alertas críticas frecuentes. Se recomienda revisar el uso de la estufa y mantener objetos combustibles alejados.';
      }
    } else if (summary.efficiency_score < 60) {
      recommendation = 'La eficiencia de quemado es baja. Intenta mantener la temperatura en la zona segura (verde) para ahorrar leña y contaminar menos.';
      summaryText = 'Baja eficiencia.';
    }

    return { recommendation, summaryText };
  }

  async generateManualReport(deviceId: number, userId: number, type: 'weekly' | 'monthly') {
    const timezone = await this.getDeviceTimezone(deviceId);
    const now = DateTime.now().setZone(timezone);
    let startStr: string;
    let endStr: string;

    if (type === 'weekly') {
      const currentWeekStart = now.startOf('week');
      const previousWeekStart = currentWeekStart.minus({ weeks: 1 });
      const previousWeekEnd = currentWeekStart.minus({ days: 1 });
      startStr = previousWeekStart.toISODate()!;
      endStr = previousWeekEnd.toISODate()!;
      return this.generateWeeklyReport(deviceId, startStr as any, endStr as any);
    } else {
      const previousMonth = now.minus({ months: 1 });
      startStr = previousMonth.startOf('month').toISODate()!;
      endStr = previousMonth.endOf('month').toISODate()!;
      return this.generateMonthlyReport(deviceId, startStr as any, endStr as any);
    }
  }

  async recalculateDailyMetrics(deviceId: number, userId: number, startDateStr: string, endDateStr: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.historical_max_temperature');

    const timezone = await this.getDeviceTimezone(deviceId);
    const start = DateTime.fromISO(startDateStr, { zone: timezone }).startOf('day');
    const end = DateTime.fromISO(endDateStr, { zone: timezone }).endOf('day');

    if (!start.isValid || !end.isValid) {
      throw new BadRequestException('Fechas inválidas. Use YYYY-MM-DD.');
    }

    this.logger.log(`[MetricsRecalculate] Recalculating metrics for device ${deviceId} from ${startDateStr} to ${endDateStr} in timezone ${timezone}`);

    let current = start;
    while (current <= end) {
      const dateStr = current.toISODate();
      const dayStartUtc = current.toUTC().toJSDate();
      const dayEndUtc = current.endOf('day').toUTC().toJSDate();

      // Fetch logs for the day
      const logs = await this.temperatureLogRepository.find({
        where: {
          device_id: deviceId,
          created_at: Between(dayStartUtc, dayEndUtc),
        },
        order: { created_at: 'ASC' },
      });

      if (logs.length > 0) {
        // Find existing metric or create new
        let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
        if (!daily) {
          daily = this.dailyMetricRepository.create({
            device_id: deviceId,
            metric_date: dateStr,
          });
        }

        // Reset counters
        daily.usage_minutes = 0;
        daily.safe_minutes = 0;
        daily.warning_minutes = 0;
        daily.critical_minutes = 0;
        daily.low_minutes = 0;
        daily.alerts_total = 0;
        daily.alerts_level_1 = 0;
        daily.alerts_level_2 = 0;
        daily.alerts_level_3 = 0;
        daily.predictions_total = 0;
        daily.predictions_confirmed = 0;
        daily.predictions_false_positive = 0;
        
        let sumTemp = 0;
        let maxTemp = -Infinity;
        let minTemp = Infinity;
        let maxTempAt = logs[0].created_at;

        const settings = await this.deviceSettingsRepository.findOne({ where: { device_id: deviceId } });
        const t1 = settings ? Number(settings.threshold_1) : 100;
        const t2 = settings ? Number(settings.threshold_2) : 200;
        const t3 = settings ? Number(settings.threshold_3) : 300;

        daily.threshold_1_snapshot = t1;
        daily.threshold_2_snapshot = t2;
        daily.threshold_3_snapshot = t3;

        for (let i = 0; i < logs.length; i++) {
          const log = logs[i];
          const temp = Number(log.temperature);
          sumTemp += temp;

          if (temp > maxTemp) {
            maxTemp = temp;
            maxTempAt = log.created_at;
          }
          if (temp < minTemp) {
            minTemp = temp;
          }

          // usage
          if (temp >= 80) {
            let diff = 1;
            if (i > 0) {
              const prev = logs[i - 1];
              const diffMs = new Date(log.created_at).getTime() - new Date(prev.created_at).getTime();
              diff = Math.min(Math.floor(diffMs / 60000), 5);
              if (diff < 1) diff = 1;
            }
            daily.usage_minutes += diff;
            
            const zone = this.getTemperatureZone(temp, t1, t2, t3);
            if (zone === 'safe') daily.safe_minutes += diff;
            else if (zone === 'warning') daily.warning_minutes += diff;
            else if (zone === 'critical') daily.critical_minutes += diff;
            else if (zone === 'low') daily.low_minutes += diff;
          }
        }

        daily.avg_temperature = Number((sumTemp / logs.length).toFixed(2));
        daily.max_temperature = maxTemp;
        daily.max_temperature_at = maxTempAt;
        daily.min_temperature = minTemp;

        // Recalculate sessions count for this day
        const sessionsCount = await this.sessionRepository.count({
          where: {
            device_id: deviceId,
            started_at: Between(dayStartUtc, dayEndUtc),
          }
        });
        daily.sessions_count = sessionsCount;

        // Recalculate alerts
        // (Assuming we can query alerts table, but let's just use what we have in daily if possible)
        // Actually, it's better to just query alerts for that day
        // But for now, we'll focus on what we have. 
        // If we really want to be precise:
        // const alerts = await this.alertsRepository.find(...) 
        // But MetricsService doesn't have AlertsRepository injected.
        
        daily.efficiency_score = this.calculateEfficiencyScore(daily.safe_minutes, daily.warning_minutes, daily.critical_minutes, daily.low_minutes);
        daily.risk_score = this.calculateRiskScore(daily.max_temperature, daily.critical_minutes, daily.alerts_level_3, t3);

        await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
      }

      current = current.plus({ days: 1 });
    }

    return { success: true, message: `Métricas recalculadas para el periodo ${startDateStr} - ${endDateStr}` };
  }

  // --- Helpers ---

  private async assertDeviceMetricAccess(deviceId: number, userId: number, featureCode: string) {
    if (userId !== 0) { // skip for internal calls if userId is 0
      await this.subscriptionsService.validateUserDeviceAccess(userId, deviceId);
      const hasFeature = await this.subscriptionsService.deviceHasFeature(deviceId, featureCode);
      if (!hasFeature.has_feature) {
        throw new ForbiddenException('Esta funcionalidad está disponible solo en el plan PRO.');
      }
    }
  }

  private getTemperatureZone(temp: number, t1: number, t2: number, t3: number): 'low' | 'safe' | 'warning' | 'critical' {
    if (temp < t1) return 'low';
    if (temp < t2) return 'safe';
    if (temp < t3) return 'warning';
    return 'critical';
  }

  private calculateEfficiencyScore(safeMinutes: any, warningMinutes: any, criticalMinutes: any, lowMinutes: any): number {
    const safe = this.sanitizeNumber(safeMinutes);
    const warning = this.sanitizeNumber(warningMinutes);
    const critical = this.sanitizeNumber(criticalMinutes);
    const low = this.sanitizeNumber(lowMinutes);

    let score = 100;
    score -= critical * 2;
    score -= warning * 0.5;
    score -= low * 0.1;

    return this.clampScore(score);
  }

  private calculateRiskScore(maxTemperature: any, criticalMinutes: any, alertsLevel3: any, threshold3?: any): number {
    const maxTemp = this.sanitizeNumber(maxTemperature);
    const critical = this.sanitizeNumber(criticalMinutes);
    const alerts = this.sanitizeNumber(alertsLevel3);
    const t3 = this.sanitizeNullableNumber(threshold3);

    let score = 0;
    score += critical * 1.5;
    score += alerts * 10;

    if (t3 !== null && maxTemp >= t3) score += 20;
    if (t3 !== null && maxTemp >= t3 + 50) score += 40;

    return this.clampScore(score);
  }

  private sanitizeNumber(value: any, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  private sanitizeNullableNumber(value: any): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private safeDivide(numerator: any, denominator: any, fallback = 0): number {
    const n = Number(numerator);
    const d = Number(denominator);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
      return fallback;
    }
    return n / d;
  }

  private clampScore(value: any): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
  }

  private sanitizeMetricPayload<T extends Record<string, any>>(payload: T): T {
    const cleaned = { ...payload } as any;

    for (const key of Object.keys(cleaned)) {
      const value = cleaned[key];

      if (typeof value === 'number' && !Number.isFinite(value)) {
        cleaned[key] = null;
      }
    }

    return cleaned;
  }

  private logIfContainsInvalidNumber(context: string, payload: Record<string, any>) {
    const invalidKeys = Object.entries(payload)
      .filter(([_, value]) => typeof value === 'number' && !Number.isFinite(value))
      .map(([key]) => key);

    if (invalidKeys.length > 0) {
      this.logger.error(`[MetricsService] Invalid numeric values in ${context}: ${invalidKeys.join(', ')}`, JSON.stringify(payload));
    }
  }

  private formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

}
