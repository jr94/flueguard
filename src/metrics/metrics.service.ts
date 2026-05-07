import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { DeviceDailyMetric } from './entities/device-daily-metric.entity';
import { DeviceUsageSession } from './entities/device-usage-session.entity';
import { DevicePredictionMetric } from './entities/device-prediction-metric.entity';
import { DeviceReport } from './entities/device-report.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';

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
  ) {}

  // --- API Methods ---

  async getTodayMetrics(deviceId: number, userId: number) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.daily_max_temperature');
    
    const today = new Date().toISOString().split('T')[0];
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
      };
    }

    return {
      ...metric,
      usage_label: this.formatMinutes(metric.usage_minutes),
      date: metric.metric_date,
    };
  }

  async getSummary(deviceId: number, userId: number, range: '7d' | '30d' | 'custom', startDate?: string, endDate?: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.historical_max_temperature');

    const { start, end } = this.getRangeDates(range, startDate, endDate);

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
    };
  }

  async getSessions(deviceId: number, userId: number, range: 'today' | '7d' | '30d' | 'custom', startDate?: string, endDate?: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.usage_sessions');

    const { start, end } = this.getRangeDates(range, startDate, endDate);
    // Use TIMESTAMP for sessions as they have started_at
    const startTs = new Date(start + 'T00:00:00Z');
    const endTs = new Date(end + 'T23:59:59Z');

    const sessions = await this.sessionRepository.find({
      where: {
        device_id: deviceId,
        started_at: Between(startTs, endTs),
      },
      order: { started_at: 'DESC' },
    });

    return sessions.map(s => ({
      ...s,
      duration_label: this.formatMinutes(s.duration_minutes),
    }));
  }

  async getRiskRanking(deviceId: number, userId: number, range: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.risk_ranking');

    const { start, end } = this.getRangeDates(range as any);

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
    }));
  }

  async getPredictionStats(deviceId: number, userId: number, range: string) {
    await this.assertDeviceMetricAccess(deviceId, userId, 'metrics.prediction_performance');

    const { start, end } = this.getRangeDates(range as any);
    const startTs = new Date(start + 'T00:00:00Z');
    const endTs = new Date(end + 'T23:59:59Z');

    const stats = await this.predictionRepository
      .createQueryBuilder('p')
      .select('COUNT(*)', 'predictions_total')
      .addSelect('SUM(p.was_confirmed)', 'predictions_confirmed')
      .addSelect('SUM(p.was_false_positive)', 'predictions_false_positive')
      .addSelect('AVG(p.predicted_minutes_to_threshold)', 'avg_predicted_minutes_to_threshold')
      .where('p.device_id = :deviceId', { deviceId })
      .andWhere('p.predicted_at BETWEEN :start AND :end', { start: startTs, end: endTs })
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
      const safeTemperature = this.sanitizeNumber(temperature, null);
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

      const dateStr = safeCreatedAt.toISOString().split('T')[0];

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
      const lastLog = await this.temperatureLogRepository.findOne({
        where: { device_id: deviceId, created_at: LessThanOrEqual(safeCreatedAt) },
        order: { created_at: 'DESC' },
        skip: 1 
      });

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
      const dateStr = alertCreatedAt.toISOString().split('T')[0];
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
      const dateStr = new Date().toISOString().split('T')[0];
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
          const dateStr = pred.predicted_at.toISOString().split('T')[0];
          let daily = await this.dailyMetricRepository.findOne({ where: { device_id: deviceId, metric_date: dateStr } });
          if (daily) {
            daily.predictions_confirmed = this.sanitizeNumber(daily.predictions_confirmed) + 1;
            await this.dailyMetricRepository.save(this.sanitizeMetricPayload(daily));
          }

        } else if (createdAt > limitTime) {
          pred.was_false_positive = 1;
          await this.predictionRepository.save(this.sanitizeMetricPayload(pred));

          // Update daily counter
          const dateStr = pred.predicted_at.toISOString().split('T')[0];
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

  async generateWeeklyReport(deviceId: number, periodStart: Date, periodEnd: Date) {
    try {
      const summary = await this.getSummary(deviceId, 0, 'custom', periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]);
      
      const report = this.reportRepository.create({
        device_id: deviceId,
        report_type: 'weekly',
        period_start: periodStart,
        period_end: periodEnd,
        total_usage_minutes: summary.total_usage_minutes,
        max_temperature: summary.max_temperature,
        max_temperature_at: summary.max_temperature_at,
        avg_temperature: summary.avg_temperature,
        total_sessions: summary.total_sessions,
        total_alerts: summary.total_alerts,
        total_critical_alerts: summary.total_critical_alerts,
        safe_minutes: summary.safe_minutes,
        warning_minutes: summary.warning_minutes,
        critical_minutes: summary.critical_minutes,
        low_minutes: summary.low_minutes,
        efficiency_score: summary.efficiency_score,
        risk_score: summary.risk_score,
      });

      // Recommendations
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

      report.recommendation = recommendation;
      report.summary = summaryText;

      await this.reportRepository.save(report);
      return report;
    } catch (error) {
      this.logger.error(`Error generating weekly report: ${error.message}`);
    }
  }

  async recalculateDailyMetrics(deviceId: number, date: Date) {
    // Optional implementation: re-scan all telemetry for a day and re-generate metrics
    this.logger.log(`Recalculating metrics for device ${deviceId} on ${date.toDateString()}`);
    // implementation could be added here if needed
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
    const cleaned = { ...payload };

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

  private getRangeDates(range: 'today' | '7d' | '30d' | 'custom', startDate?: string, endDate?: string) {
    const now = new Date();
    let start: string;
    let end: string = now.toISOString().split('T')[0];

    if (range === 'today') {
      start = end;
    } else if (range === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = d.toISOString().split('T')[0];
    } else if (range === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      start = d.toISOString().split('T')[0];
    } else {
      start = startDate || end;
      end = endDate || end;
    }

    return { start, end };
  }
}
