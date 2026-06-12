import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { DeviceMaintenance } from './entities/device-maintenance.entity';
import {
  DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
  MAINTENANCE_PREVENTIVE_HOURS,
  MAINTENANCE_URGENT_HOURS,
  MAINTENANCE_REPEAT_DAYS,
} from './constants/maintenance.constants';
import { DevicesService } from '../devices/devices.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

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
    let maintenance = await this.maintenanceRepository.findOne({
      where: { device_id: deviceId },
    });

    if (!maintenance) {
      maintenance = this.maintenanceRepository.create({
        device_id: deviceId,
        threshold_hours: DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
        usage_seconds_accumulated: 0,
      });
      maintenance = await this.maintenanceRepository.save(maintenance);
    }

    const usageHours = Number(
      (maintenance.usage_seconds_accumulated / 3600).toFixed(2),
    );
    const percentage = Math.min(
      100,
      Math.round(
        (maintenance.usage_seconds_accumulated /
          (maintenance.threshold_hours * 3600)) *
          100,
      ),
    );

    let maintenanceStatus = 'ok';
    if (usageHours >= MAINTENANCE_URGENT_HOURS) {
      maintenanceStatus = 'urgent';
    } else if (usageHours >= MAINTENANCE_PREVENTIVE_HOURS) {
      maintenanceStatus = 'preventive';
    }

    return {
      device_id: maintenance.device_id,
      usage_seconds_accumulated: maintenance.usage_seconds_accumulated,
      usage_hours: usageHours,
      threshold_hours: maintenance.threshold_hours,
      preventive_threshold_hours: MAINTENANCE_PREVENTIVE_HOURS,
      urgent_threshold_hours: MAINTENANCE_URGENT_HOURS,
      percentage: percentage,
      maintenance_status: maintenanceStatus,
      requires_maintenance: percentage >= 100,
      requires_preventive_maintenance:
        usageHours >= MAINTENANCE_PREVENTIVE_HOURS,
      requires_urgent_maintenance: usageHours >= MAINTENANCE_URGENT_HOURS,
      last_notified_at: maintenance.last_notified_at,
      last_preventive_notified_at: maintenance.last_preventive_notified_at,
      last_urgent_notified_at: maintenance.last_urgent_notified_at,
      last_reset_at: maintenance.last_reset_at,
    };
  }

  async addUsageSeconds(deviceId: number, secondsToAdd: number) {
    if (secondsToAdd <= 0) return;

    let maintenance = await this.maintenanceRepository.findOne({
      where: { device_id: deviceId },
    });
    if (!maintenance) {
      maintenance = this.maintenanceRepository.create({
        device_id: deviceId,
        threshold_hours: DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
        usage_seconds_accumulated: 0,
      });
    }

    maintenance.usage_seconds_accumulated =
      Number(maintenance.usage_seconds_accumulated) + secondsToAdd;
    await this.maintenanceRepository.save(maintenance);

    await this.checkAndNotifyMaintenance(deviceId);
  }

  async checkAndNotifyMaintenance(deviceId: number) {
    const maintenance = await this.maintenanceRepository.findOne({
      where: { device_id: deviceId },
    });
    if (!maintenance) return;

    const usageHours = Number(
      (maintenance.usage_seconds_accumulated / 3600).toFixed(2),
    );

    // Urgent check
    if (usageHours >= MAINTENANCE_URGENT_HOURS) {
      if (this.shouldNotify(maintenance.last_urgent_notified_at)) {
        this.logger.log(
          `[Maintenance] Urgent alert sent device=${deviceId} usageHours=${usageHours}`,
        );

        const alert = await this.alertsService.create({
          device_id: deviceId,
          temperature: 0,
          alert_level: '2', // Level 2 for urgent
          alert_type: 'maintenance_urgent',
          message: `Tu estufa acumula ${Math.floor(usageHours)} horas de uso. Se recomienda realizar mantención urgente y limpieza del cañón antes de seguir usando la estufa intensivamente.`,
        });

        const device = await this.devicesService.findOne(deviceId);
        await this.pushNotificationsService.sendAlertNotification(
          deviceId,
          {
            ...alert,
            title: 'Mantención urgente requerida',
            type: 'maintenance_urgent',
          },
          device.serial_number,
        );

        maintenance.last_urgent_notified_at = new Date();
        maintenance.last_notified_at = new Date(); // Maintain compatibility
        await this.maintenanceRepository.save(maintenance);
        return;
      } else {
        this.logger.log(
          `[Maintenance] Urgent alert skipped device=${deviceId} reason=recently_notified`,
        );
        return;
      }
    }

    // Preventive check
    if (usageHours >= MAINTENANCE_PREVENTIVE_HOURS) {
      if (this.shouldNotify(maintenance.last_preventive_notified_at)) {
        this.logger.log(
          `[Maintenance] Preventive alert sent device=${deviceId} usageHours=${usageHours}`,
        );

        const alert = await this.alertsService.create({
          device_id: deviceId,
          temperature: 0,
          alert_level: '1', // Level 1 for preventive
          alert_type: 'maintenance_preventive',
          message: `Tu estufa acumula ${Math.floor(usageHours)} horas de uso. Se recomienda realizar una limpieza preventiva del cañón y revisar el estado general de la estufa.`,
        });

        const device = await this.devicesService.findOne(deviceId);
        await this.pushNotificationsService.sendAlertNotification(
          deviceId,
          {
            ...alert,
            title: 'Limpieza preventiva recomendada',
            type: 'maintenance_preventive',
          },
          device.serial_number,
        );

        maintenance.last_preventive_notified_at = new Date();
        maintenance.last_notified_at = new Date(); // Maintain compatibility
        await this.maintenanceRepository.save(maintenance);
      } else {
        this.logger.log(
          `[Maintenance] Preventive alert skipped device=${deviceId} reason=recently_notified`,
        );
      }
    }
  }

  private shouldNotify(
    lastNotifiedAt: Date | null,
    repeatDays = MAINTENANCE_REPEAT_DAYS,
  ): boolean {
    if (!lastNotifiedAt) return true;

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastNotifiedAt.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    return diffDays >= repeatDays;
  }

  @Cron('0 0 9 * * *', { timeZone: 'America/Santiago' }) // Every day at 09:00 AM
  async handleMaintenanceCron() {
    this.logger.log('[Maintenance] Running daily maintenance check cron');

    const thresholdSeconds = MAINTENANCE_PREVENTIVE_HOURS * 3600;
    const records = await this.maintenanceRepository.find({
      where: {
        usage_seconds_accumulated: MoreThanOrEqual(thresholdSeconds),
      },
    });

    this.logger.log(
      `[Maintenance] Found ${records.length} devices requiring maintenance check`,
    );

    for (const record of records) {
      try {
        await this.checkAndNotifyMaintenance(record.device_id);
      } catch (error) {
        this.logger.error(
          `[Maintenance] Error checking maintenance for device ${record.device_id}: ${error.message}`,
        );
      }
    }
  }

  async resetMaintenance(deviceId: number, userId: number) {
    await this.assertAccess(deviceId, userId);

    const maintenance = await this.maintenanceRepository.findOne({
      where: { device_id: deviceId },
    });
    if (!maintenance) {
      throw new NotFoundException('Registro de mantención no encontrado');
    }

    maintenance.usage_seconds_accumulated = 0;
    maintenance.last_notified_at = null;
    maintenance.last_preventive_notified_at = null;
    maintenance.last_urgent_notified_at = null;
    maintenance.last_reset_at = new Date();

    await this.maintenanceRepository.save(maintenance);
    return this.getOrCreate(deviceId);
  }

  async updateThreshold(
    deviceId: number,
    thresholdHours: number,
    userId: number,
  ) {
    await this.assertAccess(deviceId, userId);

    if (thresholdHours <= 0) {
      throw new ForbiddenException('El umbral de horas debe ser mayor a 0');
    }

    let maintenance = await this.maintenanceRepository.findOne({
      where: { device_id: deviceId },
    });
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
