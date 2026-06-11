import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { calculatePredictiveCurveAlert } from './predictive-alert.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { TemperatureLog } from './entities/temperature-log.entity';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { DevicesService } from '../devices/devices.service';
import { DeviceSettingsService } from '../device-settings/device-settings.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class TelemetryService {
  private readonly LOW_TEMP_ALERT_INTERVAL_MS = 10 * 60 * 1000;
  private readonly lowTempAlertControl = new Map<number, number>();

  constructor(
    @InjectRepository(TemperatureLog)
    private readonly temperatureLogRepository: Repository<TemperatureLog>,
    private readonly devicesService: DevicesService,
    private readonly deviceSettingsService: DeviceSettingsService,
    private readonly alertsService: AlertsService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly metricsService: MetricsService,
  ) { }

  async processTelemetry(createTelemetryDto: CreateTelemetryDto) {
    const { serial_number, temperature } = createTelemetryDto;

    // 1. Find device by serial number
    const device = await this.devicesService.findBySerialNumber(serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${serial_number} not found`);
    }

    // 2. Save register in temperature_logs
    const log = this.temperatureLogRepository.create({
      device_id: device.id,
      temperature,
    });
    await this.temperatureLogRepository.save(log);

    // 3. Update device last connection and status
    await this.devicesService.updateLastConnection(device.id);

    // 3.1. Process metrics in background (don't block telemetry flow)
    this.metricsService.processTelemetryForMetrics(device.id, temperature, log.created_at)
      .catch(e => console.error('[Metrics] Error processing telemetry metrics:', e));

    // 3.2. Confirm predictions if needed
    this.metricsService.confirmPredictionIfNeeded(device.id, temperature, log.created_at)
      .catch(e => console.error('[Metrics] Error confirming predictions:', e));

    // 4. Calcular el nivel de alerta basándonos en los ajustes de umbral
    try {
      const settings = await this.deviceSettingsService.findByDeviceId(device.id);

      if (settings && settings.notifications_enabled) {
        let finalLevel: string | null = null;
        let message = '';
        const logTemp = Number(temperature);

        const t1 = settings.threshold_1 ? Number(settings.threshold_1) : null;
        const t2 = settings.threshold_2 ? Number(settings.threshold_2) : null;
        const t3 = settings.threshold_3 ? Number(settings.threshold_3) : null;

        if (t1 !== null && logTemp >= t1) {
          this.lowTempAlertControl.delete(device.id);
        }

        // Obtener historial reciente para calcular la diferencia de temperatura
        const lastLogs = await this.temperatureLogRepository.find({
          where: { device_id: device.id },
          order: { created_at: 'DESC' },
          take: 2,
        });

        let diff = 0;
        if (lastLogs.length === 2) {
          const currentTemp = Number(lastLogs[0].temperature);
          const prevTemp = Number(lastLogs[1].temperature);
          diff = currentTemp - prevTemp;
        }

        // Comprobamos en orden de mayor a menor gravedad
        if (t3 !== null && logTemp >= t3) {
          if (diff < -1) {
            // Se desactiva la alerta si comienza a bajar con diferencia <-2
          } else {
            finalLevel = '3';
            message = `Riesgo de incendio: la temperatura alcanzó ${temperature}°C. Revisa la estufa de inmediato.`;
          }
        }
        else if (t2 !== null && logTemp >= t2) {
          if (diff <= 0) {
            // Se desactiva la alerta si comienza a bajar con diferencia <=0
          } else {
            finalLevel = '2';
            message = `Temperatura alta ${temperature}°C. Reduce la combustión o revisa la estufa.`;
          }
        }
        else if (t1 !== null && settings.sound_alarm_temp_low) {
          const eligibleLowTempUsers = await this.subscriptionsService.getEligibleNotificationUsersForFeature(device.id, 'low_temperature_alert');
          const hasLowTempFeature = eligibleLowTempUsers.length > 0;

          if (hasLowTempFeature) {
            const lastLowTempAlertAt = this.lowTempAlertControl.get(device.id);
            const now = Date.now();

            if (logTemp < t1) {
              const shouldSendLowTempAlert =
                !lastLowTempAlertAt ||
                now - lastLowTempAlertAt >= this.LOW_TEMP_ALERT_INTERVAL_MS;

              if (shouldSendLowTempAlert) {
                finalLevel = '1';
                message = `Temperatura baja ${temperature}°C. Es momento de agregar leña.`;

                // Guarda el momento de la última alerta nivel 1
                this.lowTempAlertControl.set(device.id, now);
              }
            } else {
              // Si supera o iguala el umbral, se resetea el contador
              this.lowTempAlertControl.delete(device.id);
            }
          } else {
            this.lowTempAlertControl.delete(device.id);
          }
        }

        // 5. Aplicar limitación de frecuencia para alertas Nivel 2 reales (máximo cada 3 minutos)
        let isRateLimited = false;
        if (finalLevel === '2') {
          const hasRecent = await this.alertsService.hasRecentAlert(device.id, '2', 3, 'NORMAL_LEVEL_2');
          if (hasRecent) {
            console.log(`[ALERTS] Nivel 2 real omitida para device ${device.id}: ya fue notificada hace menos de 3 minutos.`);
            isRateLimited = true;
          } else {
            console.log(`[ALERTS] Nivel 2 real enviada para device ${device.id}: no existía alerta reciente.`);
          }
        }

        // 6. Si de la comparación sacamos un nivel y no está limitado, generamos la alerta
        if (finalLevel && !isRateLimited) {
          const newAlert = await this.alertsService.create({
            device_id: device.id,
            temperature,
            alert_level: finalLevel,
            alert_type: `NORMAL_LEVEL_${finalLevel}`,
            message,
          });

          // 6.1. Enviar notificación push de forma independiente
          this.pushNotificationsService.sendAlertNotification(device.id, newAlert, serial_number)
            .catch((e) => console.error('Error en ejecución background de push notification:', e));

          // 6.2. Actualizar métricas de alertas
          this.metricsService.updateMetricsFromAlert(device.id, Number(finalLevel), newAlert.created_at)
            .catch(e => console.error('[Metrics] Error updating metrics from alert:', e));
        }

        // 7. Lógica Predictiva
        if (t2 !== null && t3 !== null) {
          const eligiblePredictiveUsers = await this.subscriptionsService.getEligibleNotificationUsersForFeature(device.id, 'predictive_curve_alerts');
          const canUsePredictive = eligiblePredictiveUsers.length > 0;

          if (canUsePredictive) {
            console.log(`[PREDICTIVE] Enabled for device ${device.id}`);
            const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
            const historyLogs = await this.temperatureLogRepository.find({
              where: {
                device_id: device.id,
                created_at: MoreThanOrEqual(twentyMinsAgo),
              },
              order: { created_at: 'DESC' },
              take: 20,
            });

            const points = historyLogs.map(log => ({
              temperature: Number(log.temperature),
              createdAt: new Date(log.created_at)
            })).reverse();

            const prediction = calculatePredictiveCurveAlert(points, t2, t3, 10);

            if (prediction.canPredict && (prediction.alertLevel === 2 || prediction.alertLevel === 3)) {
              const predLevelStr = String(prediction.alertLevel);

              // Si la temperatura actual ya genera alerta normal 3, o si genera normal 2 y la predicción es 2, no predecimos
              const skipPredictive = (finalLevel === '3') || (finalLevel === '2' && predLevelStr === '2');

              if (!skipPredictive) {
                const hasRecent = await this.alertsService.hasRecentPredictiveAlert(device.id, predLevelStr, 10);

                if (!hasRecent) {
                  const newPredictiveAlert = await this.alertsService.create({
                    device_id: device.id,
                    temperature: prediction.predictedMax,
                    alert_level: predLevelStr,
                    alert_type: `PREDICTIVE_LEVEL_${predLevelStr}`,
                    message: prediction.notificationMessage || prediction.reason,
                  });

                  this.pushNotificationsService.sendAlertNotification(device.id, newPredictiveAlert, serial_number)
                    .catch((e) => console.error('Error en ejecución background de push notification predictiva:', e));

                  // Guardar métrica de predicción
                  this.metricsService.savePredictionMetric({
                    device_id: device.id,
                    predicted_at: new Date(),
                    current_temperature: temperature,
                    predicted_temperature: prediction.predictedMax,
                    target_threshold: prediction.alertLevel === 3 ? t3 : t2,
                    predicted_minutes_to_threshold: prediction.minutesToThreshold,
                    slope: prediction.slope,
                    alert_id: newPredictiveAlert.id,
                  }).catch(e => console.error('[Metrics] Error saving prediction metric:', e));
                }
              }
            }
          } else {
            console.log(`[PREDICTIVE] Skipped for device ${device.id}: predictive_curve_alerts not enabled`);
          }
        }
      }
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    return {
      success: true,
      message: 'Telemetry saved',
    };
  }

  async getDeviceTelemetry(deviceId: number, hours: number): Promise<TemperatureLog[]> {
    // Verificar si el dispositivo existe. findOne lanza NotFoundException si no existe.
    await this.devicesService.findOne(deviceId);

    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - hours);

    return this.temperatureLogRepository.find({
      select: ['id', 'device_id', 'temperature', 'created_at'],
      where: {
        device_id: deviceId,
        created_at: MoreThanOrEqual(pastDate),
      },
      order: {
        created_at: 'ASC',
      },
    });
  }

  async getDeviceHistory(userId: number, deviceId: number, view: string) {
    console.log(`[Telemetry] History request: deviceId=${deviceId}, userId=${userId}, view=${view}`);
    // 1. Validar acceso al dispositivo
    await this.subscriptionsService.validateUserDeviceAccess(userId, deviceId);

    // 2. Obtener features de suscripción del usuario
    const featuresInfo = await this.subscriptionsService.getUserPlanFeatures(userId);
    const historyDays = Number(featuresInfo.features?.extended_history_days || 0);

    // 3. Validar permisos según la vista solicitada
    this.validateHistoryAccess(view, historyDays);

    // 4. Ejecutar query según la vista
    return this.executeHistoryQuery(deviceId, view);
  }

  private validateHistoryAccess(view: string, historyDays: number) {
    if (view === 'hour') return; // Siempre permitido

    if (view === 'day' || view === 'week') {
      if (historyDays < 7) {
        throw new ForbiddenException('Esta vista de historial requiere un plan superior.');
      }
      return;
    }

    if (view === 'month') {
      if (historyDays < 30) {
        throw new ForbiddenException('Esta vista de historial requiere un plan superior.');
      }
      return;
    }

    throw new ForbiddenException('Vista de historial no válida.');
  }

  private async executeHistoryQuery(deviceId: number, view: string) {
    const timezone = await this.metricsService.getDeviceTimezone(deviceId);
    const nowLocal = DateTime.now().setZone(timezone);

    let startUtc: Date;
    let grouping: 'hour' | 'day' | 'week';

    switch (view) {
      case 'hour':
        return this.getDeviceTelemetry(deviceId, 1);
      case 'day':
        startUtc = nowLocal.minus({ hours: 24 }).toUTC().toJSDate();
        grouping = 'hour';
        break;
      case 'week':
        startUtc = nowLocal.minus({ days: 7 }).toUTC().toJSDate();
        grouping = 'day';
        break;
      case 'month':
        startUtc = nowLocal.minus({ days: 30 }).toUTC().toJSDate();
        grouping = 'week';
        break;
      default:
        throw new ForbiddenException('Vista de historial no válida.');
    }

    const logs = await this.temperatureLogRepository.find({
      where: {
        device_id: deviceId,
        created_at: MoreThanOrEqual(startUtc),
      },
      order: { created_at: 'ASC' },
    });

    const buckets = new Map<string, any>();

    for (const log of logs) {
      const local = DateTime.fromJSDate(log.created_at, { zone: 'utc' }).setZone(timezone);
      let bucketLocal: DateTime;

      if (grouping === 'hour') bucketLocal = local.startOf('hour');
      else if (grouping === 'day') bucketLocal = local.startOf('day');
      else bucketLocal = local.startOf('week');

      const key = bucketLocal.toISO();
      if (!key) continue;
      
      const temp = Number(log.temperature);

      if (!buckets.has(key)) {
        buckets.set(key, {
          bucket: bucketLocal.toUTC().toISO()!,
          local_bucket: key,
          temperature_sum: temp,
          min_temperature: temp,
          max_temperature: temp,
          sample_count: 1,
        });
      } else {
        const b = buckets.get(key);
        if (b) {
          b.temperature_sum += temp;
          b.sample_count += 1;
          if (temp < b.min_temperature) b.min_temperature = temp;
          if (temp > b.max_temperature) b.max_temperature = temp;
        }
      }
    }

    const results = Array.from(buckets.values()).map(b => ({
      created_at: b.bucket,
      temperature: Number((b.temperature_sum / b.sample_count).toFixed(2)),
      avg_temperature: Number((b.temperature_sum / b.sample_count).toFixed(2)),
      min_temperature: Number(b.min_temperature.toFixed(2)),
      max_temperature: Number(b.max_temperature.toFixed(2)),
      sample_count: b.sample_count,
      timezone,
    }));

    return results;
  }

  async getLastTempForUserDevices(userId: number) {
    const devices = await this.devicesService.findByUserId(userId);
    const lastTempResults = await this.buildLastTempResults(devices);
    const subStatus = await this.subscriptionsService.getMySubscription(userId);

    const hasActive = subStatus?.is_active === true;
    const premium = {
      hasActiveSubscription: hasActive,
      planCode: hasActive ? (subStatus.plan?.code || 'plus') : 'basic',
      planName: hasActive ? (subStatus.plan?.name || 'FlueGuard Plus') : 'FlueGuard Basic',
      status: hasActive ? (subStatus.status || 'active') : 'inactive',
      provider: hasActive ? (subStatus.provider || null) : null,
      providerProductId: hasActive ? (subStatus.provider_product_id || null) : null,
      providerBasePlanId: hasActive ? (subStatus.provider_base_plan_id || null) : null,
      providerProductDisplayName: hasActive ? (subStatus.provider_product_display_name || null) : null,
      providerProductSlot: hasActive ? (subStatus.provider_product_slot || null) : null,
      manageSubscriptionUrl: hasActive ? (subStatus.manage_subscription_url || null) : null,
      currentPeriodEnd: hasActive ? (subStatus.current_period_end || null) : null,
    };

    return {
      premium,
      devices: lastTempResults,
    };
  }

  async getLastTempAllDevices() {
    const devices = await this.devicesService.findAll();
    return this.buildLastTempResults(devices);
  }

  private async buildLastTempResults(devices: any[]) {
    const results: any[] = [];

    for (const device of devices) {
      const lastLogs = await this.temperatureLogRepository.find({
        where: { device_id: device.id },
        order: { created_at: 'DESC' },
        take: 4,
      });

      const lastLog = lastLogs.length > 0 ? lastLogs[0] : null;

      let diffTemp = 1;
      if (lastLogs.length >= 2) {
        const count = Math.min(2, Math.floor(lastLogs.length / 2));
        const recentLogs = lastLogs.slice(0, count);
        const olderLogs = lastLogs.slice(count, count * 2);

        const recentAvg = recentLogs.reduce((sum, log) => sum + Number(log.temperature), 0) / count;
        const olderAvg = olderLogs.reduce((sum, log) => sum + Number(log.temperature), 0) / count;
        const diff = recentAvg - olderAvg;

        if (diff < -1) diffTemp = 0;
        else if (diff <= 1) diffTemp = 1;
        else if (diff <= 3) diffTemp = 2;
        else if (diff <= 6) diffTemp = 3;
        else diffTemp = 4;
      }

      let alarmLowTemp = true;
      let threshold_1: number | null = null;
      let threshold_2: number | null = null;
      let threshold_3: number | null = null;

      try {
        const settings = await this.deviceSettingsService.findByDeviceId(device.id);
        alarmLowTemp = settings.sound_alarm_temp_low;
        threshold_1 = settings.threshold_1;
        threshold_2 = settings.threshold_2;
        threshold_3 = settings.threshold_3;
      } catch (e) {
        // keep default
      }

      results.push({
        device: {
          ...device,
          alarm_low_temp: alarmLowTemp,
          threshold_1,
          threshold_2,
          threshold_3,
          diffTemp,
        },
        last_temperature: lastLog ? lastLog.temperature : null,
        last_log_time: lastLog ? lastLog.created_at : null,
      });
    }


    return results;
  }
}
