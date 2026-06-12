import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { DeviceFirmwareUpdate } from '../device-firmware-updates/entities/device-firmware-update.entity';
import { DevicePushToken } from '../push-tokens/entities/device-push-token.entity';
import { DevicePredictionMetric } from '../metrics/entities/device-prediction-metric.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MetricsService } from '../metrics/metrics.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class SystemMaintenanceService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(TemperatureLog)
    private readonly logRepository: Repository<TemperatureLog>,
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(DeviceFirmwareUpdate)
    private readonly firmwareUpdateRepository: Repository<DeviceFirmwareUpdate>,
    @InjectRepository(DevicePushToken)
    private readonly pushTokenRepository: Repository<DevicePushToken>,
    @InjectRepository(DevicePredictionMetric)
    private readonly predictionMetricRepository: Repository<DevicePredictionMetric>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly metricsService: MetricsService,
  ) {}

  private readonly logger = new Logger(SystemMaintenanceService.name);

  async runCleanup() {
    const now = new Date();
    this.logger.log('[SystemMaintenance] Starting cleanup');

    // Dates
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600000);
    const oneHundredEightyDaysAgo = new Date(
      now.getTime() - 180 * 24 * 3600000,
    );
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 3600000);

    // 1. Marcar dispositivos offline si llevan más de 20 minutos sin conexión.
    const updateResult = await this.deviceRepository
      .createQueryBuilder()
      .update(Device)
      .set({ status: 'offline' })
      .where('last_connection IS NOT NULL')
      .andWhere('last_connection < :twentyMinsAgo', { twentyMinsAgo })
      .andWhere('status != :offlineStatus', { offlineStatus: 'offline' })
      .execute();
    this.logger.log(
      `[SystemMaintenance] Devices marked offline: ${updateResult.affected || 0}`,
    );

    // 2. Borrar temperature_logs anteriores a 30 días.
    const deleteResult = await this.logRepository
      .createQueryBuilder()
      .delete()
      .from(TemperatureLog)
      .where('created_at < :thirtyDaysAgo', { thirtyDaysAgo })
      .execute();
    this.logger.log(
      `[SystemMaintenance] Temperature logs deleted: ${deleteResult.affected || 0}`,
    );

    // 3. Limpieza de alerts compatible con métricas PRO.
    // Nivel 1: mantener 30 días.
    const deleteInfoAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_level = :level', { level: '1' })
      .andWhere('created_at < :date', { date: thirtyDaysAgo })
      .execute();

    // Nivel 2: mantener 90 días.
    const deleteWarningAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_level = :level', { level: '2' })
      .andWhere('created_at < :date', { date: ninetyDaysAgo })
      .execute();

    // Nivel 3: mantener 365 días.
    const deleteCriticalAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_level = :level', { level: '3' })
      .andWhere('created_at < :date', { date: oneYearAgo })
      .execute();

    // Alertas de mantenimiento: mantener 365 días.
    const deleteMaintenanceAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_type IN (:...types)', {
        types: ['maintenance', 'maintenance_preventive', 'maintenance_urgent'],
      })
      .andWhere('created_at < :date', { date: oneYearAgo })
      .execute();

    this.logger.log(
      `[SystemMaintenance] Alerts L1 deleted: ${deleteInfoAlerts.affected || 0}`,
    );
    this.logger.log(
      `[SystemMaintenance] Alerts L2 deleted: ${deleteWarningAlerts.affected || 0}`,
    );
    this.logger.log(
      `[SystemMaintenance] Alerts L3 deleted: ${deleteCriticalAlerts.affected || 0}`,
    );
    this.logger.log(
      `[SystemMaintenance] Maintenance alerts deleted: ${deleteMaintenanceAlerts.affected || 0}`,
    );

    // 4. Borrar firmware updates anteriores a 30 días.
    const deleteFirmwareUpdates = await this.firmwareUpdateRepository
      .createQueryBuilder()
      .delete()
      .from(DeviceFirmwareUpdate)
      .where('created_at < :date', { date: thirtyDaysAgo })
      .execute();
    this.logger.log(
      `[SystemMaintenance] Firmware updates deleted: ${deleteFirmwareUpdates.affected || 0}`,
    );

    // 5. Borrar push tokens inactivos.
    const deleteInactiveTokens = await this.pushTokenRepository
      .createQueryBuilder()
      .delete()
      .from(DevicePushToken)
      .where('is_active = :isActive', { isActive: false })
      .andWhere('updated_at < :date', { date: thirtyDaysAgo })
      .execute();
    this.logger.log(
      `[SystemMaintenance] Inactive push tokens deleted: ${deleteInactiveTokens.affected || 0}`,
    );

    // 6. Limpieza de device_prediction_metrics anteriores a 180 días.
    const deletePredictionMetrics = await this.predictionMetricRepository
      .createQueryBuilder()
      .delete()
      .from(DevicePredictionMetric)
      .where('created_at < :date', { date: oneHundredEightyDaysAgo })
      .execute();
    this.logger.log(
      `[SystemMaintenance] Prediction metrics deleted: ${deletePredictionMetrics.affected || 0}`,
    );

    // 7. Revalidación diaria Google Play.
    let google_play_revalidation: any = null;
    const shouldRunGooglePlay =
      await this.subscriptionsService.shouldRunGooglePlayDailyRevalidation();

    if (shouldRunGooglePlay) {
      google_play_revalidation =
        await this.subscriptionsService.revalidateGooglePlaySubscriptionsDaily();
    }

    // 8. Generar reportes programados de métricas PRO.
    await this.metricsService.runScheduledReports();

    this.logger.log('[SystemMaintenance] Cleanup completed');

    return {
      success: true,
      message: 'Maintenance completed',
      devices_marked_offline: updateResult.affected || 0,
      temperature_logs_deleted: deleteResult.affected || 0,
      alerts_info_deleted: deleteInfoAlerts.affected || 0,
      alerts_warning_deleted: deleteWarningAlerts.affected || 0,
      alerts_critical_deleted: deleteCriticalAlerts.affected || 0,
      alerts_maintenance_deleted: deleteMaintenanceAlerts.affected || 0,
      firmware_updates_deleted: deleteFirmwareUpdates.affected || 0,
      inactive_push_tokens_deleted: deleteInactiveTokens.affected || 0,
      prediction_metrics_deleted: deletePredictionMetrics.affected || 0,
      google_play_revalidation,
      executed_at: now.toISOString(),
    };
  }
}
