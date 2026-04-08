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

        // Comprobamos en orden de mayor a menor gravedad
        if (t3 !== null && logTemp >= t3) {
          finalLevel = '3';
          message = `Riesgo de incendio: la temperatura alcanzó ${temperature}°C. Revisa la estufa de inmediato. (valor critico ${settings.threshold_3}°)`;
        }
        else if (t2 !== null && logTemp >= t2) {
          finalLevel = '2';
          message = `Temperatura alta ${temperature}°C. Reduce la combustión o revisa la estufa. (valor máximo ${settings.threshold_2}°)`;
        }
        else if (t1 !== null && logTemp < t1 && settings.sound_alarm_temp_low) {
          finalLevel = '1';
          message = `Temperatura baja ${temperature}°C. Es momento de agregar leña. (valor mínimo ${settings.threshold_1}°)`;
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
        take: 10,
      });

      const lastLog = lastLogs.length > 0 ? lastLogs[0] : null;

      let diffTemp = 1; // 1 = se mantiene
      if (lastLogs.length >= 2) {
        const count = Math.min(5, Math.floor(lastLogs.length / 2));
        const recentLogs = lastLogs.slice(0, count);
        const olderLogs = lastLogs.slice(count, count * 2);

        const recentAvg = recentLogs.reduce((sum, log) => sum + Number(log.temperature), 0) / count;
        const olderAvg = olderLogs.reduce((sum, log) => sum + Number(log.temperature), 0) / count;
        const diff = recentAvg - olderAvg;

        if (diff > 1) {
          diffTemp = 2; // Sube la temperatura
        } else if (diff < -1) {
          diffTemp = 0; // Baja la temperatura
        }
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
