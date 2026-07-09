import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PortalDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getDashboardMetrics() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // ── CURRENT TOTALS ────────────────────────────────────────────────────

    const [{ total_devices }] = await this.dataSource.query(
      `SELECT COUNT(*) AS total_devices FROM devices`,
    );

    const [{ total_users }] = await this.dataSource.query(
      `SELECT COUNT(*) AS total_users FROM users`,
    );

    // Active: last log < 10 min AND temperature > 30
    const [{ active_devices }] = await this.dataSource.query(`
      SELECT COUNT(*) AS active_devices
      FROM (
        SELECT tl.device_id, tl.temperature, tl.created_at
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

    // Disconnected: no log, invalid temp, hot+stale (≥10min), cold+very_stale (>60min)
    const [{ disconnected_devices }] = await this.dataSource.query(`
      SELECT COUNT(*) AS disconnected_devices
      FROM devices d
      LEFT JOIN (
        SELECT tl.device_id, tl.temperature, tl.created_at
        FROM temperature_logs tl
        INNER JOIN (
          SELECT device_id, MAX(created_at) AS last_log
          FROM temperature_logs
          GROUP BY device_id
        ) latest ON tl.device_id = latest.device_id AND tl.created_at = latest.last_log
      ) AS last_logs ON d.id = last_logs.device_id
      WHERE last_logs.device_id IS NULL
         OR last_logs.temperature IS NULL
         OR (last_logs.temperature > 30  AND TIMESTAMPDIFF(MINUTE, last_logs.created_at, UTC_TIMESTAMP()) >= 10)
         OR (last_logs.temperature <= 30 AND TIMESTAMPDIFF(MINUTE, last_logs.created_at, UTC_TIMESTAMP()) > 60)
    `);

    // ── MONTHLY SERIES: total_devices & total_users (day 1 → today) ──────

    const monthLabels: string[] = [];
    for (let d = 1; d <= day; d++) {
      monthLabels.push(String(d).padStart(2, '0'));
    }

    // Devices created this month, per day
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

    const [{ baseline_devices }] = await this.dataSource.query(`
      SELECT COUNT(*) AS baseline_devices FROM devices
      WHERE created_at < '${monthStart} 00:00:00'
    `);

    // Users created this month, per day
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

    const [{ baseline_users }] = await this.dataSource.query(`
      SELECT COUNT(*) AS baseline_users FROM users
      WHERE created_at < '${monthStart} 00:00:00'
    `);

    // Build monthly cumulative arrays
    const monthTotalDevices: number[] = [];
    const monthTotalUsers: number[] = [];
    let cumulativeDevices = Number(baseline_devices);
    let cumulativeUsers = Number(baseline_users);

    for (const label of monthLabels) {
      cumulativeDevices += devicesByDay[label] ?? 0;
      cumulativeUsers += usersByDay[label] ?? 0;
      monthTotalDevices.push(cumulativeDevices);
      monthTotalUsers.push(cumulativeUsers);
    }

    // ── LAST 24 HOURS: active_devices & disconnected_devices per hour ─────

    // Build 24 hour-bucket labels (UTC), from 25h ago to current completed hour
    const last24hLabels: string[] = [];
    const last24hBuckets: string[] = []; // full ISO hour strings for lookup

    for (let h = 23; h >= 0; h--) {
      const bucketTime = new Date(now.getTime() - h * 60 * 60 * 1000);
      const hh = String(bucketTime.getUTCHours()).padStart(2, '0');
      last24hLabels.push(`${hh}:00`);
      const yyyy = bucketTime.getUTCFullYear();
      const mm = String(bucketTime.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(bucketTime.getUTCDate()).padStart(2, '0');
      last24hBuckets.push(`${yyyy}-${mm}-${dd} ${hh}:00:00`);
    }

    // Active devices per hour: COUNT(DISTINCT device_id) where temp > 30
    const activeByHour: Record<string, number> = {};
    const activeHourRows: { hour_bucket: string; total: string }[] =
      await this.dataSource.query(`
        SELECT
          DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour_bucket,
          COUNT(DISTINCT device_id) AS total
        FROM temperature_logs
        WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
          AND temperature > 30
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')
        ORDER BY hour_bucket
      `);
    activeHourRows.forEach((r) => {
      // Normalize key: trim to 'YYYY-MM-DD HH:00:00'
      activeByHour[r.hour_bucket.substring(0, 19)] = Number(r.total);
    });

    // Cold-idle devices per hour (temp <= 30)
    const coldByHour: Record<string, number> = {};
    const coldHourRows: { hour_bucket: string; total: string }[] =
      await this.dataSource.query(`
        SELECT
          DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour_bucket,
          COUNT(DISTINCT device_id) AS total
        FROM temperature_logs
        WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
          AND temperature <= 30
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')
        ORDER BY hour_bucket
      `);
    coldHourRows.forEach((r) => {
      coldByHour[r.hour_bucket.substring(0, 19)] = Number(r.total);
    });

    const totalDev = Number(total_devices);

    // Build last24h series
    const last24hActive: number[] = [];
    const last24hDisconnected: number[] = [];

    for (const bucket of last24hBuckets) {
      const active = activeByHour[bucket] ?? 0;
      const cold = coldByHour[bucket] ?? 0;
      const disconnected = Math.max(0, totalDev - active - cold);
      last24hActive.push(active);
      last24hDisconnected.push(disconnected);
    }

    return {
      current: {
        total_devices: Number(total_devices),
        total_users: Number(total_users),
        active_devices: Number(active_devices),
        disconnected_devices: Number(disconnected_devices),
      },
      month: {
        labels: monthLabels,
        total_devices: monthTotalDevices,
        total_users: monthTotalUsers,
      },
      last24h: {
        labels: last24hLabels,
        active_devices: last24hActive,
        disconnected_devices: last24hDisconnected,
      },
    };
  }
}
