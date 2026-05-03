import { Injectable, NotFoundException } from '@nestjs/common';
import { calculatePredictiveCurveAlert } from './predictive-alert.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { TemperatureLog } from './entities/temperature-log.entity';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { DevicesService } from '../devices/devices.service';
import { DeviceSettingsService } from '../device-settings/device-settings.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

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
        }

        // 5. Si de la comparación sacamos un nivel, generamos la alerta
        if (finalLevel) {
          const newAlert = await this.alertsService.create({
            device_id: device.id,
            temperature,
            alert_level: finalLevel,
            alert_type: `NORMAL_LEVEL_${finalLevel}`,
            message,
          });

          // 6. Enviar notificación push de forma independiente
          this.pushNotificationsService.sendAlertNotification(device.id, newAlert, serial_number)
            .catch((e) => console.error('Error en ejecución background de push notification:', e));
        }

        // 7. Lógica Predictiva
        if (t2 !== null && t3 !== null) {
          const historyLogs = await this.temperatureLogRepository.find({
            where: { device_id: device.id },
            order: { created_at: 'DESC' },
            take: 10,
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
              }
            }
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

  async getLastTempForUserDevices(userId: number) {
    const devices = await this.devicesService.findByUserId(userId);
    return this.buildLastTempResults(devices);
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

    results.sort((a, b) => {
      const timeA = a.last_log_time ? new Date(a.last_log_time).getTime() : 0;
      const timeB = b.last_log_time ? new Date(b.last_log_time).getTime() : 0;

      // 1. Prioridad: más reciente
      if (timeB !== timeA) {
        return timeB - timeA;
      }

      // 2. Prioridad secundaria: mayor temperatura
      const tempA = a.last_temperature !== null ? Number(a.last_temperature) : -Infinity;
      const tempB = b.last_temperature !== null ? Number(b.last_temperature) : -Infinity;

      return tempB - tempA;
    });

    return results;
  }
}
