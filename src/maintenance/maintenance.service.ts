import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { Alert } from '../alerts/entities/alert.entity';
@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(TemperatureLog)
    private readonly logRepository: Repository<TemperatureLog>,
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
  ) {}

  async runCleanup() {
    const now = new Date();

    // 1. Devices cleanup: offline if > 20 minutes
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60000);
    
    const updateResult = await this.deviceRepository
      .createQueryBuilder()
      .update(Device)
      .set({ status: 'offline' })
      .where('last_connection IS NOT NULL')
      .andWhere('last_connection < :twentyMinsAgo', { twentyMinsAgo })
      .andWhere('status != :offlineStatus', { offlineStatus: 'offline' })
      .execute();

    // 2. Logs cleanup: delete earlier than 3 hours
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600000);
    
    const deleteResult = await this.logRepository
      .createQueryBuilder()
      .delete()
      .from(TemperatureLog)
      .where('created_at < :threeHoursAgo', { threeHoursAgo })
      .execute();
    // 3. Alerts cleanup by severity/type
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600000); // 24 hours
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600000);   // 7 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600000); // 30 days

    const deleteInfoAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_level = :level', { level: '1' })
      .andWhere('created_at < :date', { date: twentyFourHoursAgo })
      .execute();

    const deleteWarningAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_level = :level', { level: '2' })
      .andWhere('created_at < :date', { date: sevenDaysAgo })
      .execute();

    const deleteCriticalAlerts = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .from(Alert)
      .where('alert_level = :level', { level: '3' })
      .andWhere('created_at < :date', { date: thirtyDaysAgo })
      .execute();

    return {
      success: true,
      message: 'Maintenance completed',
      devices_marked_offline: updateResult.affected || 0,
      temperature_logs_deleted: deleteResult.affected || 0,
      alerts_info_deleted: deleteInfoAlerts.affected || 0,
      alerts_warning_deleted: deleteWarningAlerts.affected || 0,
      alerts_critical_deleted: deleteCriticalAlerts.affected || 0,
      executed_at: now.toISOString(),
    };
  }
}
