import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class PortalDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getDashboardMetrics() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    // ISO date strings for month boundaries
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // ── CURRENT TOTALS ────────────────────────────────────────────────────

    // 1. Total devices
    const [{ total_devices }] = await this.dataSource.query(
      `SELECT COUNT(*) AS total_devices FROM devices`,
    );

    // 2. Total FlueGuard users (mobile app users)
    const [{ total_users }] = await this.dataSource.query(
      `SELECT COUNT(*) AS total_users FROM users`,
    );

    // 3. Active devices: last log < 10 min ago AND temperature > 30
    const [{ active_devices }] = await this.dataSource.query(`
      SELECT COUNT(*) AS active_devices
      FROM (
        SELECT tl.device_id,
               tl.temperature,
               tl.created_at
        FROM temperature_logs tl
        INNER JOIN (
          SELECT device_id, MAX(created_at) AS last_log
          FROM temperature_logs
          GROUP BY device_id
        ) latest ON tl.device_id = latest.device_id AND tl.created_at = latest.last_log
      ) AS last_logs
      WHERE temperature > 30
        AND TIMESTAMPDIFF(MINUTE, created_at, UTC_TIMESTAMP()) < 10
    `);

    // 4. Disconnected devices: no log, invalid temp, hot+old, or cold+very_old (excludes cold_idle)
    const [{ disconnected_devices }] = await this.dataSource.query(`
      SELECT COUNT(*) AS disconnected_devices
      FROM devices d
      LEFT JOIN (
        SELECT tl.device_id,
               tl.temperature,
               tl.created_at
        FROM temperature_logs tl
        INNER JOIN (
          SELECT device_id, MAX(created_at) AS last_log
          FROM temperature_logs
          GROUP BY device_id
        ) latest ON tl.device_id = latest.device_id AND tl.created_at = latest.last_log
      ) AS last_logs ON d.id = last_logs.device_id
      WHERE last_logs.device_id IS NULL
         OR last_logs.temperature IS NULL
         OR (last_logs.temperature > 30 AND TIMESTAMPDIFF(MINUTE, last_logs.created_at, UTC_TIMESTAMP()) >= 10)
         OR (last_logs.temperature <= 30 AND TIMESTAMPDIFF(MINUTE, last_logs.created_at, UTC_TIMESTAMP()) > 60)
    `);

    // ── MONTHLY SERIES (day 1 → today) ────────────────────────────────────

    // Build a calendar series for the current month
    const labels: string[] = [];
    for (let d = 1; d <= day; d++) {
      labels.push(String(d).padStart(2, '0'));
    }

    // Devices created count per day this month
    const devicesByDay: Record<string, number> = {};
    const deviceCreatedRows: { day: string; cnt: string }[] =
      await this.dataSource.query(`
        SELECT DATE(created_at) AS day, COUNT(*) AS cnt
        FROM devices
        WHERE created_at >= '${monthStart} 00:00:00'
          AND created_at <= '${monthEnd} 23:59:59'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `);
    deviceCreatedRows.forEach((r) => {
      const label = String(new Date(r.day).getUTCDate()).padStart(2, '0');
      devicesByDay[label] = Number(r.cnt);
    });

    // Devices total until start of month (for cumulative baseline)
    const [{ baseline_devices }] = await this.dataSource.query(`
      SELECT COUNT(*) AS baseline_devices
      FROM devices
      WHERE created_at < '${monthStart} 00:00:00'
    `);

    // Users created count per day this month
    const usersByDay: Record<string, number> = {};
    const userCreatedRows: { day: string; cnt: string }[] =
      await this.dataSource.query(`
        SELECT DATE(created_at) AS day, COUNT(*) AS cnt
        FROM users
        WHERE created_at >= '${monthStart} 00:00:00'
          AND created_at <= '${monthEnd} 23:59:59'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `);
    userCreatedRows.forEach((r) => {
      const label = String(new Date(r.day).getUTCDate()).padStart(2, '0');
      usersByDay[label] = Number(r.cnt);
    });

    // Users total until start of month (cumulative baseline)
    const [{ baseline_users }] = await this.dataSource.query(`
      SELECT COUNT(*) AS baseline_users
      FROM users
      WHERE created_at < '${monthStart} 00:00:00'
    `);

    // Active devices per day: distinct devices with at least one log > 30°C that day
    const activeByDay: Record<string, number> = {};
    const activeRows: { day: string; cnt: string }[] =
      await this.dataSource.query(`
        SELECT DATE(created_at) AS day,
               COUNT(DISTINCT device_id) AS cnt
        FROM temperature_logs
        WHERE temperature > 30
          AND created_at >= '${monthStart} 00:00:00'
          AND created_at <= '${monthEnd} 23:59:59'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `);
    activeRows.forEach((r) => {
      const label = String(new Date(r.day).getUTCDate()).padStart(2, '0');
      activeByDay[label] = Number(r.cnt);
    });

    // Cold-idle devices per day: distinct devices with log that day AND temperature <= 30
    const coldByDay: Record<string, number> = {};
    const coldRows: { day: string; cnt: string }[] =
      await this.dataSource.query(`
        SELECT DATE(created_at) AS day,
               COUNT(DISTINCT device_id) AS cnt
        FROM temperature_logs
        WHERE temperature <= 30
          AND created_at >= '${monthStart} 00:00:00'
          AND created_at <= '${monthEnd} 23:59:59'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `);
    coldRows.forEach((r) => {
      const label = String(new Date(r.day).getUTCDate()).padStart(2, '0');
      coldByDay[label] = Number(r.cnt);
    });

    // Build series arrays
    const monthTotalDevices: number[] = [];
    const monthTotalUsers: number[] = [];
    const monthActiveDevices: number[] = [];
    const monthDisconnectedDevices: number[] = [];

    let cumulativeDevices = Number(baseline_devices);
    let cumulativeUsers = Number(baseline_users);

    for (const label of labels) {
      cumulativeDevices += devicesByDay[label] ?? 0;
      cumulativeUsers += usersByDay[label] ?? 0;

      const activeToday = activeByDay[label] ?? 0;
      const coldToday = coldByDay[label] ?? 0;
      const disconnectedToday = Math.max(
        0,
        cumulativeDevices - activeToday - coldToday,
      );

      monthTotalDevices.push(cumulativeDevices);
      monthTotalUsers.push(cumulativeUsers);
      monthActiveDevices.push(activeToday);
      monthDisconnectedDevices.push(disconnectedToday);
    }

    return {
      current: {
        total_devices: Number(total_devices),
        total_users: Number(total_users),
        active_devices: Number(active_devices),
        disconnected_devices: Number(disconnected_devices),
      },
      month: {
        labels,
        total_devices: monthTotalDevices,
        total_users: monthTotalUsers,
        active_devices: monthActiveDevices,
        disconnected_devices: monthDisconnectedDevices,
      },
    };
  }
}
