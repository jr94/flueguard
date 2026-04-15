import { Injectable, NotFoundException } from '@nestjs/common';
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
            message = `Riesgo de incendio: la temperatura alcanzó ${temperature}°C. Revisa la estufa de inmediato. (valor critico ${settings.threshold_3}°)`;
          }
        }
        else if (t2 !== null && logTemp >= t2) {
          if (diff < -1) {
            // Se desactiva la alerta si comienza a bajar con diferencia <-1
          } else {
            finalLevel = '2';
            message = `Temperatura alta ${temperature}°C. Reduce la combustión o revisa la estufa. (valor máximo ${settings.threshold_2}°)`;
          }
        }
        else if (t1 !== null && logTemp < t1 && settings.sound_alarm_temp_low) {
          if (diff > 1) {
            // Se desactiva la alerta si vuelve a subir con diferencia >1
          } else {
            finalLevel = '1';
            message = `Temperatura baja ${temperature}°C. Es momento de agregar leña. (valor mínimo ${settings.threshold_1}°)`;
          }
        }

        // 5. Si de la comparación sacamos un nivel, generamos la alerta
        if (finalLevel) {
          const newAlert = await this.alertsService.create({
            device_id: device.id,
            temperature,
            alert_level: finalLevel,
            message,
          });

          // 6. Enviar notificación push de forma independiente
          this.pushNotificationsService.sendAlertNotification(device.id, newAlert, serial_number)
            .catch((e) => console.error('Error en ejecución background de push notification:', e));
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
    const results: any[] = [];

    for (const device of devices) {
      const lastLogs = await this.temperatureLogRepository.find({
        where: { device_id: device.id },
        order: { created_at: 'DESC' },
        take: 20, // Extraemos hasta 20 registros
      });

      const lastLog = lastLogs.length > 0 ? lastLogs[0] : null;

      let diffTemp = 1; // 1 = se mantiene
      if (lastLogs.length >= 3) {
        // Curva de predicción basada en los últimos registros
        const t0 = Number(lastLogs[0].temperature); // Actual
        const t1 = Number(lastLogs[1].temperature); // Anterior
        const t2 = Number(lastLogs[2].temperature); // Tras-anterior

        // Velocidad de cambio inmediato
        const currentVelocity = t0 - t1;
        const previousVelocity = t1 - t2;

        // Aceleración (variación de la velocidad)
        const acceleration = currentVelocity - previousVelocity;

        // Tendencia general suavizada con hasta 20 registros históricos
        const oldestTemp = Number(lastLogs[lastLogs.length - 1].temperature);
        const generalVelocity = (t0 - oldestTemp) / (lastLogs.length - 1);

        // Predicción del cambio futuro:
        // Mezclamos un 90% de la tendencia reciente y 10% de la histórica,
        // con una incidencia menor de la aceleración para no sobreestimar la predicción.
        const predictedChange = (currentVelocity * 0.9) + (generalVelocity * 0.1) + (acceleration * 0.2);

        if (predictedChange < -1) {
          diffTemp = 0; // bajando
        } else if (predictedChange <= 1) {
          diffTemp = 1; // estable
        } else if (predictedChange <= 3) {
          diffTemp = 2; // subiendo normal
        } else if (predictedChange <= 6) {
          diffTemp = 3; // subiendo acelerada
        } else {
          diffTemp = 4; // subiendo peligrosa
        }
      } else if (lastLogs.length === 2) {
        // Fallback si apenas hay 2 registros
        const diff = Number(lastLogs[0].temperature) - Number(lastLogs[1].temperature);
        if (diff < -1) diffTemp = 0;
        else if (diff <= 1) diffTemp = 1;
        else if (diff <= 3) diffTemp = 2;
        else if (diff <= 6) diffTemp = 3;
        else diffTemp = 4;
      }

      let alarmLowTemp = true; // Default from DB is 1 (true)
      try {
        const settings = await this.deviceSettingsService.findByDeviceId(device.id);
        alarmLowTemp = settings.sound_alarm_temp_low;
      } catch (e) {
        // If settings not found, it keeps the default value
      }

      results.push({
        device: {
          ...device,
          alarm_low_temp: alarmLowTemp,
          diffTemp: diffTemp,
        },
        last_temperature: lastLog ? lastLog.temperature : null,
        last_log_time: lastLog ? lastLog.created_at : null,
      });
    }

    results.sort((a, b) => {
      const tempA = a.last_temperature !== null ? Number(a.last_temperature) : -Infinity;
      const tempB = b.last_temperature !== null ? Number(b.last_temperature) : -Infinity;
      return tempB - tempA;
    });

    return results;
  }
}
