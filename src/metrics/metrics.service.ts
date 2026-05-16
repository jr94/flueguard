import { Injectable, ForbiddenException, Logger, BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, LessThan, MoreThan } from 'typeorm';
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
  private readonly STOVE_ON_TEMP = 60;

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
  ) { }

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
    range: 'today' | '7d' | '30d' | 'custom' | 'hour' | '1h',
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
        off_minutes: 0,
        efficient_minutes: 0,
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

  async getSummary(deviceId: number, userId: number, range: 'today' | '7d' | '30d' | 'custom' | 'hour' | '1h', startDate?: string, endDate?: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.historical_max_temperature');

    const timezone = await this.getDeviceTimezone(deviceId);
    
    if (range === 'hour' || (range as string) === '1h') {
      const now = DateTime.now();
      const utcEnd = now.toUTC().toJSDate();
      const utcStart = now.minus({ hours: 1 }).toUTC().toJSDate();

      const stats = await this.temperatureLogRepository
        .createQueryBuilder('l')
        .select('COUNT(*)', 'total_samples')
        .addSelect('SUM(CASE WHEN l.temperature > 60 THEN 1 ELSE 0 END)', 'usage_samples')
        .addSelect('SUM(CASE WHEN l.temperature >= 120 AND l.temperature <= 180 THEN 1 ELSE 0 END)', 'efficient_samples')
        .where('l.device_id = :deviceId', { deviceId })
        .andWhere('l.created_at BETWEEN :utcStart AND :utcEnd', { utcStart: utcStart, utcEnd: utcEnd })
        .getRawOne();

      const usage_samples = Number(stats.usage_samples || 0);
      const efficient_samples = Number(stats.efficient_samples || 0);
      const efficiency_score = usage_samples > 0 
        ? Number(((efficient_samples / usage_samples) * 100).toFixed(2)) 
        : 0;

      const period_start = now.minus({ hours: 1 }).setZone(timezone).toISO();
      const period_end = now.setZone(timezone).toISO();

      this.logger.log(`[EfficiencyHour] device=${deviceId} start=${period_start} end=${period_end} usage_samples=${usage_samples} efficient_samples=${efficient_samples} score=${efficiency_score}`);

      return {
        range: 'hour',
        period_start,
        period_end,
        usage_samples,
        efficient_samples,
        efficiency_score,
      };
    }

    const { startDate: start, endDate: end } = this.getLocalDateRangeForRange(range as any, timezone, startDate, endDate);

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
      .addSelect('SUM(m.off_minutes)', 'off_minutes')
      .addSelect('SUM(m.efficient_minutes)', 'efficient_minutes')
      .addSelect('SUM(m.usage_samples)', 'total_usage_samples')
      .addSelect('SUM(m.efficient_samples)', 'total_efficient_samples')
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
      off_minutes: Number(result.off_minutes || 0),
      efficient_minutes: Number(result.efficient_minutes || 0),
      usage_samples: Number(result.total_usage_samples || 0),
      efficient_samples: Number(result.total_efficient_samples || 0),
      efficiency_score: Number((Number(result.total_usage_samples || 0) > 0 
        ? (Number(result.total_efficient_samples || 0) / Number(result.total_usage_samples || 0)) * 100 
        : 0).toFixed(2)),
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
    });

    const rankedDays = days.map(d => {
      const over_temperature_minutes = this.sanitizeNumber(d.warning_minutes) + this.sanitizeNumber(d.critical_minutes);

      const risk_ranking_score = this.calculateRiskRankingScore({
        maxTemperature: d.max_temperature,
        threshold2: d.threshold_2_snapshot || 220,
        threshold3: d.threshold_3_snapshot || 330,
        alertsLevel2: d.alerts_level_2,
        alertsLevel3: d.alerts_level_3,
        warningMinutes: d.warning_minutes,
        criticalMinutes: d.critical_minutes,
      });

      this.logger.log(`[MetricsService] risk ranking day calculated device=${deviceId} date=${d.metric_date} maxTemp=${d.max_temperature} alerts2=${d.alerts_level_2} overTempMin=${over_temperature_minutes} alerts3=${d.alerts_level_3} score=${risk_ranking_score}`);

      return {
        date: d.metric_date,
        max_temperature: d.max_temperature,
        max_temperature_at: d.max_temperature_at,
        critical_minutes: d.critical_minutes,
        warning_minutes: d.warning_minutes,
        over_temperature_minutes,
        alerts_total: d.alerts_total,
        alerts_level_2: d.alerts_level_2,
        alerts_level_3: d.alerts_level_3,
        risk_score: risk_ranking_score,
        timezone,
      };
    });

    // Sorting
    rankedDays.sort((a, b) =>
      b.risk_score - a.risk_score ||
      b.over_temperature_minutes - a.over_temperature_minutes ||
      b.max_temperature - a.max_temperature ||
      b.alerts_level_2 - a.alerts_level_2 ||
      b.alerts_level_3 - a.alerts_level_3
    );

    return rankedDays.slice(0, 10);
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
          usage_minutes: 0,
          safe_minutes: 0,
          warning_minutes: 0,
          critical_minutes: 0,
          low_minutes: 0,
          off_minutes: 0,
          efficient_minutes: 0,
          sessions_count: 0,
          alerts_total: 0,
          alerts_level_1: 0,
          alerts_level_2: 0,
          alerts_level_3: 0,
          predictions_total: 0,
          predictions_confirmed: 0,
          predictions_false_positive: 0,
          logs_count: 0,
          usage_samples: 0,
          efficient_samples: 0,
          min_temperature: safeTemperature,
          max_temperature: safeTemperature,
          max_temperature_at: safeCreatedAt,
          avg_temperature: safeTemperature,
          threshold_1_snapshot: t1,
          threshold_2_snapshot: t2,
          threshold_3_snapshot: t3,
          efficiency_score: 0,
          risk_score: 0,
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

      // 2. Zone updates & Gap handling
      const lastLogs = await this.temperatureLogRepository.find({
        where: { device_id: deviceId, created_at: LessThanOrEqual(safeCreatedAt) },
        order: { created_at: 'DESC' },
        take: 1,
        skip: 1
      });
      const lastLog = lastLogs[0];

      const MAX_VALID_GAP = 5;
      let usageAdd = 0;
      let efficientAdd = 0;
      let minutesDiff = 0;
      let elapsedMinutes = 0;
      let isValidGap = false;

      const previousTemp = lastLog ? this.sanitizeNumber(lastLog.temperature, safeTemperature) : safeTemperature;
      const inEfficientRange = safeTemperature >= 120 && safeTemperature <= 180;
      const isUsage = safeTemperature > 60;

      if (lastLog) {
        const diffMs = safeCreatedAt.getTime() - new Date(lastLog.created_at).getTime();
        elapsedMinutes = this.safeDivide(diffMs, 60000);
        
        if (elapsedMinutes > 0 && elapsedMinutes <= MAX_VALID_GAP) {
          isValidGap = true;
          usageAdd = isUsage ? elapsedMinutes : 0;
          efficientAdd = (isUsage && inEfficientRange) ? elapsedMinutes : 0;
          minutesDiff = Math.max(1, Math.round(elapsedMinutes));
        } else {
          isValidGap = false;
          usageAdd = 0;
          efficientAdd = 0;
          minutesDiff = 0;

          if (Math.floor(elapsedMinutes) > 60) {
            await this.splitGapAndAddOffMinutes(deviceId, new Date(lastLog.created_at), safeCreatedAt, timezone, daily);
          }
        }
      }

      this.logger.log(`[EfficiencySegment] prev_temp=${previousTemp.toFixed(2)} curr_temp=${safeTemperature.toFixed(2)} elapsed=${elapsedMinutes.toFixed(2)} valid_gap=${isValidGap} is_usage=${isUsage} efficient=${inEfficientRange && isValidGap && isUsage} usage_add=${usageAdd.toFixed(2)} efficient_add=${efficientAdd.toFixed(2)}`);

      const skipZoneClassification = Math.floor(elapsedMinutes) > 60;
      minutesDiff = this.sanitizeNumber(minutesDiff, 0);

      const zone = this.getTemperatureZone(safeTemperature, t1, t2, t3);
      this.logger.log(`[MetricsService] zone=${zone} temp=${safeTemperature} device=${deviceId} minutes=${minutesDiff}`);

      if (zone === 'safe') daily.safe_minutes = this.sanitizeNumber(daily.safe_minutes) + minutesDiff;
      else if (zone === 'warning') daily.warning_minutes = this.sanitizeNumber(daily.warning_minutes) + minutesDiff;
      else if (zone === 'critical') daily.critical_minutes = this.sanitizeNumber(daily.critical_minutes) + minutesDiff;
      else if (zone === 'low') daily.low_minutes = this.sanitizeNumber(daily.low_minutes) + minutesDiff;
      else if (zone === 'off') daily.off_minutes = this.sanitizeNumber(daily.off_minutes) + minutesDiff;

      if (isUsage && isValidGap) {
        daily.usage_minutes = this.sanitizeNumber(daily.usage_minutes) + usageAdd;
      }

      if (inEfficientRange && isValidGap && isUsage) {
        daily.efficient_minutes = this.sanitizeNumber(daily.efficient_minutes) + efficientAdd;
      }

      // Sample-based Efficiency (New logic)
      if (isUsage) {
        daily.usage_samples = this.sanitizeNumber(daily.usage_samples) + 1;
        if (inEfficientRange) {
          daily.efficient_samples = this.sanitizeNumber(daily.efficient_samples) + 1;
        }
      }

      const maintenanceStatus = await this.maintenanceService.getStatus(deviceId);
      const maintenanceUsageHours = Number(maintenanceStatus?.usage_hours || 0);

      daily.efficiency_score = this.calculateEfficiencyScore(daily.efficient_samples, daily.usage_samples);
      daily.risk_score = this.calculateRiskScore(
        daily.max_temperature,
        daily.warning_minutes,
        daily.critical_minutes,
        daily.alerts_level_2,
        daily.alerts_level_3,
        t2,
        t3,
        maintenanceUsageHours
      );

      this.logger.log(`[MetricsService] risk recalculated device=${deviceId} risk=${daily.risk_score} maintenanceHours=${maintenanceUsageHours}`);

      this.logIfContainsInvalidNumber('device_daily_metrics', daily);
      await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));

      // 3. Session Management
      let activeSession = await this.sessionRepository.findOne({
        where: { device_id: deviceId, status: 'active' },
      });

      // New Rule: Close session if gap > 60 min
      if (skipZoneClassification && activeSession) {
        this.logger.log(`[SESSIONS] Sesión cerrada por gap > 60 min. device=${deviceId} endAt=${lastLog.created_at}`);
        activeSession.status = 'closed';
        activeSession.ended_at = new Date(lastLog.created_at);

        if (!activeSession.maintenance_counted) {
          const durationSeconds = activeSession.duration_minutes * 60;
          await this.maintenanceService.addUsageSeconds(deviceId, durationSeconds);
          activeSession.maintenance_counted = true;
        }
        await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
        activeSession = null; // Mark as null so the logic below can potentially start a new one
      }

      if (safeTemperature >= this.STOVE_ON_TEMP) {
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
          await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));
        } else {
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
          else if (zone === 'off') activeSession.off_minutes = this.sanitizeNumber(activeSession.off_minutes) + minutesDiff;

          activeSession.duration_minutes = this.sanitizeNumber(activeSession.duration_minutes) + usageAdd;
          
          if (inEfficientRange && isValidGap && isUsage) {
            activeSession.efficient_minutes = this.sanitizeNumber(activeSession.efficient_minutes) + efficientAdd;
          }

          if (isUsage) {
            activeSession.usage_samples = this.sanitizeNumber(activeSession.usage_samples) + 1;
            if (inEfficientRange) {
              activeSession.efficient_samples = this.sanitizeNumber(activeSession.efficient_samples) + 1;
            }
          }

          activeSession.efficiency_score = this.calculateEfficiencyScore(activeSession.efficient_samples, activeSession.usage_samples);
          activeSession.risk_score = this.calculateRiskScore(
            activeSession.max_temperature,
            activeSession.warning_minutes,
            activeSession.critical_minutes,
            activeSession.alerts_level_2,
            activeSession.alerts_level_3,
            t2,
            t3,
            maintenanceUsageHours
          );
        }
        this.logIfContainsInvalidNumber('device_usage_sessions', activeSession);
        await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
      } else if (activeSession) {
        const recentLogs = await this.temperatureLogRepository.find({
          where: { device_id: deviceId, created_at: MoreThanOrEqual(new Date(safeCreatedAt.getTime() - 20 * 60000)) },
          order: { created_at: 'DESC' },
        });

        const allBelow60 = recentLogs.length > 0 && recentLogs.every(l => Number(l.temperature) < this.STOVE_ON_TEMP);
        const firstRecentLogAt = recentLogs.length > 0 ? new Date(recentLogs[recentLogs.length - 1].created_at).getTime() : safeCreatedAt.getTime();
        const longEnough = recentLogs.length > 0 && (safeCreatedAt.getTime() - firstRecentLogAt) >= 15 * 60000;

        if (safeTemperature < this.STOVE_ON_TEMP && allBelow60 && longEnough) {
          activeSession.status = 'closed';
          activeSession.ended_at = safeCreatedAt;
          activeSession.end_temperature = safeTemperature;

          // Add usage to maintenance counter
          if (!activeSession.maintenance_counted) {
            const durationSeconds = activeSession.duration_minutes * 60;
            await this.maintenanceService.addUsageSeconds(deviceId, durationSeconds);
            activeSession.maintenance_counted = true;
          }

          await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
        } else {
          if (zone === 'low') activeSession.low_minutes = this.sanitizeNumber(activeSession.low_minutes) + minutesDiff;
          else if (zone === 'off') activeSession.off_minutes = this.sanitizeNumber(activeSession.off_minutes) + minutesDiff;
          await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
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

        // Recalculate risk
        const settings = await this.deviceSettingsRepository.findOne({ where: { device_id: deviceId } });
        const maintenanceStatus = await this.maintenanceService.getStatus(deviceId);
        const maintenanceUsageHours = Number(maintenanceStatus?.usage_hours || 0);
        const t2 = settings ? Number(settings.threshold_2) : 220;
        const t3 = settings ? Number(settings.threshold_3) : 330;

        daily.risk_score = this.calculateRiskScore(
          daily.max_temperature,
          daily.warning_minutes,
          daily.critical_minutes,
          daily.alerts_level_2,
          daily.alerts_level_3,
          t2,
          t3,
          maintenanceUsageHours
        );

        await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));
      }

      let activeSession = await this.sessionRepository.findOne({
        where: { device_id: deviceId, status: 'active' },
      });

      if (activeSession) {
        activeSession.alerts_total = this.sanitizeNumber(activeSession.alerts_total) + 1;
        if (alertLevel === 1) activeSession.alerts_level_1 = this.sanitizeNumber(activeSession.alerts_level_1) + 1;
        if (alertLevel === 2) activeSession.alerts_level_2 = this.sanitizeNumber(activeSession.alerts_level_2) + 1;
        if (alertLevel === 3) activeSession.alerts_level_3 = this.sanitizeNumber(activeSession.alerts_level_3) + 1;

        // Recalculate session risk
        const settings = await this.deviceSettingsRepository.findOne({ where: { device_id: deviceId } });
        const maintenanceStatus = await this.maintenanceService.getStatus(deviceId);
        const maintenanceUsageHours = Number(maintenanceStatus?.usage_hours || 0);
        const t2 = settings ? Number(settings.threshold_2) : 220;
        const t3 = settings ? Number(settings.threshold_3) : 330;

        activeSession.risk_score = this.calculateRiskScore(
          activeSession.max_temperature,
          activeSession.warning_minutes,
          activeSession.critical_minutes,
          activeSession.alerts_level_2,
          activeSession.alerts_level_3,
          t2,
          t3,
          maintenanceUsageHours
        );

        await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
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
      await this.predictionRepository.save(this.normalizeMetricsPayload(prediction));

      // Update daily counter
      const timezone = await this.getDeviceTimezone(data.device_id);
      const dateStr = this.getLocalMetricDate(prediction.predicted_at, timezone);
      let daily = await this.dailyMetricRepository.findOne({ where: { device_id: data.device_id, metric_date: dateStr } });
      if (daily) {
        daily.predictions_total = this.sanitizeNumber(daily.predictions_total) + 1;
        await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));
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
          await this.predictionRepository.save(this.normalizeMetricsPayload(pred));

          // Update daily counter
          const timezone = await this.getDeviceTimezone(deviceId);
          const dateStr = this.getLocalMetricDate(pred.predicted_at, timezone);
          let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
          if (daily) {
            daily.predictions_confirmed = this.sanitizeNumber(daily.predictions_confirmed) + 1;
            await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));
          }

        } else if (createdAt > limitTime) {
          pred.was_false_positive = 1;
          await this.predictionRepository.save(this.normalizeMetricsPayload(pred));

          // Update daily counter
          const timezone = await this.getDeviceTimezone(deviceId);
          const dateStr = this.getLocalMetricDate(pred.predicted_at, timezone);
          let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
          if (daily) {
            daily.predictions_false_positive = this.sanitizeNumber(daily.predictions_false_positive) + 1;
            await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));
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
      report.off_minutes = this.sanitizeNumber(summary.off_minutes);
      report.efficient_minutes = this.sanitizeNumber(summary.efficient_minutes);
      report.usage_samples = this.sanitizeNumber(summary.usage_samples);
      report.efficient_samples = this.sanitizeNumber(summary.efficient_samples);
      report.efficiency_score = this.sanitizeNumber(summary.efficiency_score);
      report.risk_score = this.sanitizeNumber(summary.risk_score);

      const { recommendation, summaryText } = this.generateReportInsights(summary);
      report.recommendation = recommendation;
      report.summary = summaryText;

      await this.reportRepository.save(this.normalizeMetricsPayload(report));
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
      report.off_minutes = this.sanitizeNumber(summary.off_minutes);
      report.efficient_minutes = this.sanitizeNumber(summary.efficient_minutes);
      report.usage_samples = this.sanitizeNumber(summary.usage_samples);
      report.efficient_samples = this.sanitizeNumber(summary.efficient_samples);
      report.efficiency_score = this.sanitizeNumber(summary.efficiency_score);
      report.risk_score = this.sanitizeNumber(summary.risk_score);

      const { recommendation, summaryText } = this.generateReportInsights(summary);
      report.recommendation = recommendation;
      report.summary = summaryText;

      await this.reportRepository.save(this.normalizeMetricsPayload(report));
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

    const dayStartUtc = start.toUTC().toJSDate();
    const dayEndUtc = end.toUTC().toJSDate();

    this.logger.log(`[MetricsRecalculate] device=${deviceId} start=${startDateStr} end=${endDateStr}`);

    // 1. Cleanup existing metrics in range
    await this.dailyMetricRepository.delete({
      device_id: deviceId,
      metric_date: Between(startDateStr, endDateStr) as any
    });

    await this.sessionRepository.delete({
      device_id: deviceId,
      started_at: Between(dayStartUtc, dayEndUtc)
    });

    await this.reportRepository.delete({
      device_id: deviceId,
      period_start: Between(dayStartUtc, dayEndUtc) as any
    });

    // 2. Fetch all logs in range
    const logs = await this.temperatureLogRepository.find({
      where: {
        device_id: deviceId,
        created_at: Between(dayStartUtc, dayEndUtc),
      },
      order: { created_at: 'ASC' },
    });

    const settings = await this.deviceSettingsRepository.findOne({ where: { device_id: deviceId } });
    const t1 = settings ? Number(settings.threshold_1) : 100;
    const t2 = settings ? Number(settings.threshold_2) : 200;
    const t3 = settings ? Number(settings.threshold_3) : 300;

    let currentDaily: DeviceDailyMetric | null = null;
    let activeSession: DeviceUsageSession | null = null;
    let prevLog = await this.temperatureLogRepository.findOne({
      where: { device_id: deviceId, created_at: LessThan(dayStartUtc) },
      order: { created_at: 'DESC' }
    });

    let totalUsage = 0;
    let totalEfficient = 0;
    let totalUsageSamples = 0;
    let totalEfficientSamples = 0;
    let sessionsRebuilt = 0;
    let daysRecalculatedSet = new Set<string>();

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const temp = Number(log.temperature);
      const logDate = this.getLocalMetricDate(log.created_at, timezone);

      if (!currentDaily || currentDaily.metric_date !== logDate) {
        if (currentDaily) {
          currentDaily.efficiency_score = this.calculateEfficiencyScore(currentDaily.efficient_minutes, currentDaily.usage_minutes);
          await this.dailyMetricRepository.save(this.normalizeMetricsPayload(currentDaily));
        }
        daysRecalculatedSet.add(logDate);
        currentDaily = this.dailyMetricRepository.create({
          device_id: deviceId,
          metric_date: logDate,
          usage_minutes: 0,
          safe_minutes: 0,
          warning_minutes: 0,
          critical_minutes: 0,
          low_minutes: 0,
          off_minutes: 0,
          efficient_minutes: 0,
          sessions_count: 0,
          alerts_total: 0,
          alerts_level_1: 0,
          alerts_level_2: 0,
          alerts_level_3: 0,
          predictions_total: 0,
          predictions_confirmed: 0,
          predictions_false_positive: 0,
          logs_count: 0,
          usage_samples: 0,
          efficient_samples: 0,
          threshold_1_snapshot: t1,
          threshold_2_snapshot: t2,
          threshold_3_snapshot: t3,
          min_temperature: temp,
          max_temperature: temp,
          max_temperature_at: log.created_at,
          avg_temperature: temp,
          efficiency_score: 0,
          risk_score: 0,
        });
      }

      if (temp > currentDaily.max_temperature) {
        currentDaily.max_temperature = temp;
        currentDaily.max_temperature_at = log.created_at;
      }
      if (temp < currentDaily.min_temperature || currentDaily.min_temperature === 0) {
        currentDaily.min_temperature = temp;
      }
      currentDaily.logs_count = (currentDaily.logs_count || 0) + 1;
      currentDaily.avg_temperature = (currentDaily.avg_temperature * (currentDaily.logs_count - 1) + temp) / currentDaily.logs_count;

      const isUsage = temp > 60;
      const inEfficientRange = temp >= 120 && temp <= 180;

      let elapsed = 0;
      let usageAdd = 0;
      let efficientAdd = 0;
      let diff = 0;
      const previousTemp = prevLog ? Number(prevLog.temperature) : temp;

      if (prevLog) {
        const diffMs = new Date(log.created_at).getTime() - new Date(prevLog.created_at).getTime();
        elapsed = diffMs / 60000;
        
        if (elapsed > 0 && elapsed <= 5) {
          usageAdd = isUsage ? elapsed : 0;
          efficientAdd = (isUsage && inEfficientRange) ? elapsed : 0;
          diff = Math.max(1, Math.round(elapsed));
        } else {
          usageAdd = 0;
          efficientAdd = 0;
          diff = 0;
          if (Math.floor(elapsed) > 60) {
            const dayStart = DateTime.fromJSDate(log.created_at).setZone(timezone).startOf('day');
            const prevAt = DateTime.fromJSDate(new Date(prevLog.created_at)).setZone(timezone);
            const gapStart = prevAt > dayStart ? prevAt : dayStart;
            const gapInToday = Math.floor(DateTime.fromJSDate(log.created_at).setZone(timezone).diff(gapStart, 'minutes').minutes);
            if (gapInToday > 0) currentDaily.off_minutes += gapInToday;
          }
        }
      }

      this.logger.log(`[EfficiencySegment] prev_temp=${previousTemp.toFixed(2)} curr_temp=${temp.toFixed(2)} elapsed=${elapsed.toFixed(2)} valid_gap=${elapsed > 0 && elapsed <= 5} is_usage=${isUsage} efficient=${inEfficientRange && elapsed > 0 && elapsed <= 5 && isUsage} usage_add=${usageAdd.toFixed(2)} efficient_add=${efficientAdd.toFixed(2)}`);

      if (isUsage && elapsed > 0 && elapsed <= 5) {
        currentDaily.usage_minutes = Number(currentDaily.usage_minutes) + usageAdd;
        totalUsage += usageAdd;
      }
      if (inEfficientRange && elapsed > 0 && elapsed <= 5 && isUsage) {
        currentDaily.efficient_minutes = Number(currentDaily.efficient_minutes) + efficientAdd;
        totalEfficient += efficientAdd;
      }

      // Samples logic
      if (isUsage) {
        currentDaily.usage_samples = (currentDaily.usage_samples || 0) + 1;
        totalUsageSamples++;
        if (inEfficientRange) {
          currentDaily.efficient_samples = (currentDaily.efficient_samples || 0) + 1;
          totalEfficientSamples++;
        }
      }

      const zone = this.getTemperatureZone(temp, t1, t2, t3);
      if (zone === 'safe') currentDaily.safe_minutes += diff;
      else if (zone === 'warning') currentDaily.warning_minutes += diff;
      else if (zone === 'critical') currentDaily.critical_minutes += diff;
      else if (zone === 'low') currentDaily.low_minutes += diff;
      else if (zone === 'off') currentDaily.off_minutes += diff;

      if (activeSession && Math.floor(elapsed) > 60) {
        activeSession.status = 'closed';
        activeSession.ended_at = prevLog ? new Date(prevLog.created_at) : log.created_at;
        await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
        activeSession = null;
      }

      if (temp >= this.STOVE_ON_TEMP) {
        if (!activeSession) {
          activeSession = this.sessionRepository.create({
            device_id: deviceId,
            started_at: log.created_at,
            start_temperature: temp,
            status: 'active',
            duration_minutes: 0,
            efficient_minutes: 0,
            safe_minutes: 0,
            warning_minutes: 0,
            critical_minutes: 0,
            low_minutes: 0,
            off_minutes: 0,
            alerts_level_2: 0,
            alerts_level_3: 0,
            usage_samples: 0,
            efficient_samples: 0,
            efficiency_score: 0,
            risk_score: 0,
            max_temperature: temp,
            max_temperature_at: log.created_at,
            avg_temperature: temp,
          });
          sessionsRebuilt++;
        }

        activeSession.duration_minutes = Number(activeSession.duration_minutes) + usageAdd;
        if (inEfficientRange && elapsed > 0 && elapsed <= 5 && isUsage) {
          activeSession.efficient_minutes = Number(activeSession.efficient_minutes) + efficientAdd;
        }

        if (isUsage) {
          activeSession.usage_samples = (activeSession.usage_samples || 0) + 1;
          if (inEfficientRange) {
            activeSession.efficient_samples = (activeSession.efficient_samples || 0) + 1;
          }
        }

        if (temp > Number(activeSession.max_temperature)) {
          activeSession.max_temperature = temp;
          activeSession.max_temperature_at = log.created_at;
        }

        if (zone === 'safe') activeSession.safe_minutes += diff;
        else if (zone === 'warning') activeSession.warning_minutes += diff;
        else if (zone === 'critical') activeSession.critical_minutes += diff;
        else if (zone === 'low') activeSession.low_minutes += diff;
        else if (zone === 'off') activeSession.off_minutes += diff;
      } else if (activeSession) {
        activeSession.duration_minutes = Number(activeSession.duration_minutes) + usageAdd;
        if (zone === 'low') activeSession.low_minutes += diff;
        else if (zone === 'off') activeSession.off_minutes += diff;
      }

      prevLog = log;
    }

    if (currentDaily) {
      currentDaily.efficiency_score = this.calculateEfficiencyScore(currentDaily.efficient_samples, currentDaily.usage_samples);
      await this.dailyMetricRepository.save(this.normalizeMetricsPayload(currentDaily));
    }
    if (activeSession) {
      activeSession.status = 'closed';
      activeSession.ended_at = logs[logs.length - 1].created_at;
      await this.sessionRepository.save(this.normalizeMetricsPayload(activeSession));
    }

    const finalEfficiencyScore = totalUsageSamples > 0 ? (totalEfficientSamples / totalUsageSamples) * 100 : 0;
    this.logger.log(`[MetricsRecalculateDone] device=${deviceId} logs=${logs.length} usage_samples=${totalUsageSamples} efficient_samples=${totalEfficientSamples} score=${finalEfficiencyScore.toFixed(2)}`);

    return {
      success: true,
      deviceId,
      startDate: startDateStr,
      endDate: endDateStr,
      daysRecalculated: daysRecalculatedSet.size,
      logsProcessed: logs.length,
      sessionsRebuilt,
      totalUsageMinutes: Number(totalUsage.toFixed(2)),
      totalEfficientMinutes: Number(totalEfficient.toFixed(2)),
      totalUsageSamples,
      totalEfficientSamples,
      efficiencyScore: Number(finalEfficiencyScore.toFixed(2))
    };
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

  private getTemperatureZone(temp: number, t1: number, t2: number, t3: number): 'off' | 'low' | 'safe' | 'warning' | 'critical' {
    if (temp < this.STOVE_ON_TEMP) return 'off';
    if (temp < t1) return 'low';
    if (temp < t2) return 'safe';
    if (temp < t3) return 'warning';
    return 'critical';
  }

  private calculateEfficiencyScore(efficientSamples: any, usageSamples: any): number {
    const efficient = this.sanitizeNumber(efficientSamples);
    const total = this.sanitizeNumber(usageSamples);

    const score = total > 0 ? (efficient / total) * 100 : 0;

    this.logger.log(`[EfficiencyCalculation] total_samples=${total} efficient_samples=${efficient} efficiency_score=${score.toFixed(2)}`);

    return Number(this.clampScore(score).toFixed(2));
  }

  private calculateRiskScore(
    maxTemperature: any,
    warningMinutes: any,
    criticalMinutes: any,
    alertsLevel2: any,
    alertsLevel3: any,
    threshold2: any,
    threshold3: any,
    maintenanceUsageHours = 0,
  ): number {
    const maxTemp = this.sanitizeNumber(maxTemperature);
    const warning = this.sanitizeNumber(warningMinutes);
    const critical = this.sanitizeNumber(criticalMinutes);
    const level2 = this.sanitizeNumber(alertsLevel2);
    const level3 = this.sanitizeNumber(alertsLevel3);
    const t2 = this.sanitizeNumber(threshold2, 220);
    const t3 = this.sanitizeNumber(threshold3, 330);
    const maintenanceHours = this.sanitizeNumber(maintenanceUsageHours);

    let score = 0;

    // tiempo sobre nivel 2
    score += warning * 0.8;
    score += critical * 1.5;

    // alertas
    score += level2 * 8;
    score += level3 * 18;

    // temperatura máxima
    if (maxTemp >= t2) score += 15;
    if (maxTemp >= t2 + 30) score += 10;
    if (maxTemp >= t3) score += 25;
    if (maxTemp >= t3 + 50) score += 20;

    // Mantención por horas acumuladas
    // 250h a 399h: riesgo medio mínimo
    // 400h o más: riesgo alto mínimo
    if (maintenanceHours >= 400) {
      score = Math.max(score, 75);
    } else if (maintenanceHours >= 250) {
      score = Math.max(score, 45);
    }

    return Math.round(this.clampScore(score));
  }

  private calculateRiskRankingScore(params: {
    maxTemperature: number;
    threshold2: number;
    threshold3: number;
    alertsLevel2: number;
    alertsLevel3: number;
    warningMinutes: number;
    criticalMinutes: number;
  }): number {
    const maxTemp = this.sanitizeNumber(params.maxTemperature);
    const t2 = this.sanitizeNumber(params.threshold2, 220);
    const t3 = this.sanitizeNumber(params.threshold3, 330);
    const alerts2 = this.sanitizeNumber(params.alertsLevel2);
    const alerts3 = this.sanitizeNumber(params.alertsLevel3);
    const warning = this.sanitizeNumber(params.warningMinutes);
    const critical = this.sanitizeNumber(params.criticalMinutes);

    const overTemperatureMinutes = warning + critical;

    let score = 0;

    // Temperatura máxima
    if (maxTemp >= t2) score += 20;
    if (maxTemp >= t2 + 30) score += 15;
    if (maxTemp >= t2 + 60) score += 15;
    if (maxTemp >= t3) score += 10;

    // Advertencias nivel 2: efecto medio
    score += Math.min(alerts2 * 8, 25);

    // Tiempo sobre nivel 2: efecto mayor
    score += Math.min(overTemperatureMinutes * 1.4, 45);

    // Alertas críticas: efecto casi nulo
    score += Math.min(alerts3 * 2, 5);

    return Math.round(this.clampScore(score));
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

  private normalizeMetricsPayload<T extends Record<string, any>>(payload: T, date?: string | Date, deviceId?: number): T {
    const cleaned = { ...payload } as any;
    const dateStr = date ? (typeof date === 'string' ? date : date.toISOString().split('T')[0]) : 'unknown';
    const devId = deviceId || payload.device_id || 0;

    const numericFields = [
      'usage_minutes', 'safe_minutes', 'warning_minutes', 'critical_minutes', 'low_minutes', 'off_minutes',
      'efficient_minutes', 'efficiency_score', 'risk_score', 'logs_count', 'sessions_count',
      'usage_samples', 'efficient_samples',
      'alerts_total', 'alerts_level_1', 'alerts_level_2', 'alerts_level_3',
      'predictions_total', 'predictions_confirmed', 'predictions_false_positive',
      'max_temperature', 'min_temperature', 'avg_temperature',
      'threshold_1_snapshot', 'threshold_2_snapshot', 'threshold_3_snapshot'
    ];

    for (const key of numericFields) {
      if (key in cleaned) {
        const value = cleaned[key];
        // Normalizar si es null, undefined, NaN o Infinity
        if (value === null || value === undefined || !Number.isFinite(Number(value))) {
          this.logger.log(`[MetricsNormalize] field=${key} original=${value} normalized=0 date=${dateStr} device=${devId}`);
          cleaned[key] = 0;
        } else {
          cleaned[key] = Number(value);
        }
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

  private async splitGapAndAddOffMinutes(deviceId: number, lastLogAt: Date, currentLogAt: Date, timezone: string, currentDaily: DeviceDailyMetric) {
    const lastLocal = DateTime.fromJSDate(lastLogAt).setZone(timezone);
    const currentLocal = DateTime.fromJSDate(currentLogAt).setZone(timezone);
    const gapMinutes = Math.floor(currentLocal.diff(lastLocal, 'minutes').minutes);

    if (gapMinutes <= 60) return;

    this.logger.log(`[METRICS] Gap detectado (> 60 min). device=${deviceId} totalMinutes=${gapMinutes}`);

    if (lastLocal.toISODate() === currentLocal.toISODate()) {
      // Caso simple: mismo día
      currentDaily.off_minutes = this.sanitizeNumber(currentDaily.off_minutes) + gapMinutes;
    } else {
      // Caso complejo: cruza medianoche
      let temp = lastLocal;
      while (temp.toISODate() !== currentLocal.toISODate()) {
        const dayStr = temp.toISODate()!;
        const endOfDay = temp.endOf('day');
        // Minutos desde temp hasta el fin de SU día
        const mins = Math.floor(endOfDay.diff(temp, 'minutes').minutes);

        if (dayStr === currentDaily.metric_date) {
          currentDaily.off_minutes = this.sanitizeNumber(currentDaily.off_minutes) + mins;
        } else {
          await this.addOffMinutesToDay(deviceId, dayStr, mins, timezone);
        }

        temp = temp.plus({ days: 1 }).startOf('day');
      }
      // Minutos remanentes en el día actual
      const remainingMins = Math.floor(currentLocal.diff(temp, 'minutes').minutes);
      currentDaily.off_minutes = this.sanitizeNumber(currentDaily.off_minutes) + remainingMins;
    }
  }

  private async addOffMinutesToDay(deviceId: number, dayStr: string, minutes: number, timezone: string) {
    if (minutes <= 0) return;
    let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dayStr } });
    if (!daily) {
      const settings = await this.deviceSettingsRepository.findOne({ where: { device_id: deviceId } });
      if (!settings) return;

      daily = this.dailyMetricRepository.create({
        device_id: deviceId,
        metric_date: dayStr,
        usage_minutes: 0,
        safe_minutes: 0,
        warning_minutes: 0,
        critical_minutes: 0,
        low_minutes: 0,
        off_minutes: 0,
        efficient_minutes: 0,
        sessions_count: 0,
        alerts_total: 0,
        alerts_level_1: 0,
        alerts_level_2: 0,
        alerts_level_3: 0,
        predictions_total: 0,
        predictions_confirmed: 0,
        predictions_false_positive: 0,
        logs_count: 0,
        usage_samples: 0,
        efficient_samples: 0,
        threshold_1_snapshot: settings.threshold_1,
        threshold_2_snapshot: settings.threshold_2,
        threshold_3_snapshot: settings.threshold_3,
        efficiency_score: 0,
        risk_score: 0,
      });
    }

    daily.off_minutes = this.sanitizeNumber(daily.off_minutes) + minutes;

    // Recalcular scores básicos si el día ya tenía datos o si acabamos de crearlo
    daily.efficiency_score = this.calculateEfficiencyScore(daily.efficient_samples, daily.usage_samples);

    await this.dailyMetricRepository.save(this.normalizeMetricsPayload(daily));
  }

  private formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

}
