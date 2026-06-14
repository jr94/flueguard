export type DeviceOperationalStatus =
  | 'connected'
  | 'cold_idle'
  | 'disconnected';

export function calculateDeviceOperationalStatus(params: {
  lastTemperature?: number | null;
  lastLogAt?: Date | string | null;
  now?: Date;
}): DeviceOperationalStatus {
  const current = params.now || new Date();
  if (!params.lastLogAt) {
    return 'disconnected';
  }

  const logTime =
    typeof params.lastLogAt === 'string'
      ? new Date(params.lastLogAt)
      : params.lastLogAt;
  if (isNaN(logTime.getTime())) {
    return 'disconnected';
  }

  const diffMs = current.getTime() - logTime.getTime();
  const diffMinutes = diffMs / (60 * 1000);

  if (diffMinutes < 10) {
    return 'connected';
  }

  if (params.lastTemperature === null || params.lastTemperature === undefined) {
    return 'disconnected';
  }

  const temp = Number(params.lastTemperature);

  if (!Number.isFinite(temp)) {
    return 'disconnected';
  }

  if (temp < 30) {
    return 'cold_idle';
  }

  return 'disconnected';
}
