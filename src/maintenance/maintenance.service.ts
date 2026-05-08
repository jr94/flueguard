import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceMaintenance } from './entities/device-maintenance.entity';
import { DEFAULT_MAINTENANCE_THRESHOLD_HOURS } from './constants/maintenance.constants';
import { DevicesService } from '../devices/devices.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(DeviceMaintenance)
    private readonly maintenanceRepository: Repository<DeviceMaintenance>,
    private readonly devicesService: DevicesService,
    private readonly alertsService: AlertsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async getStatus(deviceId: number, userId?: number) {
    if (userId) {
      await this.assertAccess(deviceId, userId);
    }
    return this.getOrCreate(deviceId);
  }

  async getOrCreate(deviceId: number): Promise<any> {
    let maintenance = await this.maintenanceRepository.findOne({ where: { device_id: deviceId } });

    if (!maintenance) {
      maintenance = this.maintenanceRepository.create({
        device_id: deviceId,
        threshold_hours: DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
        usage_seconds_accumulated: 0,
      });
      maintenance = await this.maintenanceRepository.save(maintenance);
    }

    const usageHours = Number((maintenance.usage_seconds_accumulated / 3600).toFixed(2));
    const percentage = Math.min(
      100,
      Math.round((maintenance.usage_seconds_accumulated / (maintenance.threshold_hours * 3600)) * 100)
    );

    return {
      device_id: maintenance.device_id,
      usage_seconds_accumulated: maintenance.usage_seconds_accumulated,
      usage_hours: usageHours,
      threshold_hours: maintenance.threshold_hours,
      percentage: percentage,
      requires_maintenance: percentage >= 100,
      last_notified_at: maintenance.last_notified_at,
      last_reset_at: maintenance.last_reset_at,
    };
  }

  async addUsageSeconds(deviceId: number, secondsToAdd: number) {
    if (secondsToAdd <= 0) return;

    let maintenance = await this.maintenanceRepository.findOne({ where: { device_id: deviceId } });
    if (!maintenance) {
      maintenance = this.maintenanceRepository.create({
        device_id: deviceId,
        threshold_hours: DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
        usage_seconds_accumulated: 0,
      });
    }

    maintenance.usage_seconds_accumulated = Number(maintenance.usage_seconds_accumulated) + secondsToAdd;
    await this.maintenanceRepository.save(maintenance);

    await this.checkAndNotifyMaintenance(deviceId);
  }

  async checkAndNotifyMaintenance(deviceId: number) {
    const status = await this.getOrCreate(deviceId);
    
    if (status.percentage >= 100) {
      const maintenance = await this.maintenanceRepository.findOne({ where: { device_id: deviceId } });
      if (maintenance && !maintenance.last_notified_at) {
        // Create alert
        const alert = await this.alertsService.create({
          device_id: deviceId,
          temperature: 0, // Not relevant for maintenance
          alert_level: '1',
          alert_type: 'maintenance',
          message: 'Tu estufa llegó al 100% de uso estimado. Se recomienda limpiar el cañón y revisar la estufa.',
        });

        // Send push notification
        const device = await this.devicesService.findOne(deviceId);
        await this.pushNotificationsService.sendAlertNotification(deviceId, {
          ...alert,
          title: 'Mantención recomendada',
          type: 'maintenance',
        }, device.serial_number);

        maintenance.last_notified_at = new Date();
        await this.maintenanceRepository.save(maintenance);
      }
    }
  }

  async resetMaintenance(deviceId: number, userId: number) {
    await this.assertAccess(deviceId, userId);

    let maintenance = await this.maintenanceRepository.findOne({ where: { device_id: deviceId } });
    if (!maintenance) {
      throw new NotFoundException('Registro de mantención no encontrado');
    }

    maintenance.usage_seconds_accumulated = 0;
    maintenance.last_notified_at = null;
    maintenance.last_reset_at = new Date();
    
    await this.maintenanceRepository.save(maintenance);
    return this.getOrCreate(deviceId);
  }

  async updateThreshold(deviceId: number, thresholdHours: number, userId: number) {
    await this.assertAccess(deviceId, userId);

    if (thresholdHours <= 0) {
      throw new ForbiddenException('El umbral de horas debe ser mayor a 0');
    }

    let maintenance = await this.maintenanceRepository.findOne({ where: { device_id: deviceId } });
    if (!maintenance) {
      maintenance = this.maintenanceRepository.create({
        device_id: deviceId,
        threshold_hours: thresholdHours,
        usage_seconds_accumulated: 0,
      });
    } else {
      maintenance.threshold_hours = thresholdHours;
    }

    await this.maintenanceRepository.save(maintenance);
    return this.getOrCreate(deviceId);
  }

  private async assertAccess(deviceId: number, userId: number) {
    const link = await this.devicesService.getUserDeviceLink(deviceId, userId);
    if (!link) {
      throw new ForbiddenException('No tienes acceso a este dispositivo');
    }
  }
}
