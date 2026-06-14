import { calculateDeviceOperationalStatus } from './device-status.utils';

describe('calculateDeviceOperationalStatus', () => {
  const now = new Date('2026-06-14T18:00:00.000Z');

  it('should return cold_idle if last log was 5 minutes ago and temperature is 20°C', () => {
    const lastLogAt = new Date('2026-06-14T17:55:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 20,
      lastLogAt,
      now,
    });
    expect(status).toBe('cold_idle');
  });

  it('should return cold_idle if last log was 15 minutes ago and temperature is 25°C', () => {
    const lastLogAt = new Date('2026-06-14T17:45:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 25,
      lastLogAt,
      now,
    });
    expect(status).toBe('cold_idle');
  });

  it('should return connected if last log was 5 minutes ago and temperature is 30°C', () => {
    const lastLogAt = new Date('2026-06-14T17:55:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 30,
      lastLogAt,
      now,
    });
    expect(status).toBe('connected');
  });

  it('should return connected if last log was 5 minutes ago and temperature is 250°C', () => {
    const lastLogAt = new Date('2026-06-14T17:55:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 250,
      lastLogAt,
      now,
    });
    expect(status).toBe('connected');
  });

  it('should return disconnected if last log was 15 minutes ago and temperature is 30°C', () => {
    const lastLogAt = new Date('2026-06-14T17:45:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 30,
      lastLogAt,
      now,
    });
    expect(status).toBe('disconnected');
  });

  it('should return disconnected if last log was 15 minutes ago and temperature is 80°C', () => {
    const lastLogAt = new Date('2026-06-14T17:45:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 80,
      lastLogAt,
      now,
    });
    expect(status).toBe('disconnected');
  });

  it('should return disconnected if temperature is invalid or NaN', () => {
    const lastLogAt = new Date('2026-06-14T17:45:00.000Z');
    const status1 = calculateDeviceOperationalStatus({
      lastTemperature: NaN,
      lastLogAt,
      now,
    });
    expect(status1).toBe('disconnected');

    const status2 = calculateDeviceOperationalStatus({
      lastTemperature: null,
      lastLogAt,
      now,
    });
    expect(status2).toBe('disconnected');

    const status3 = calculateDeviceOperationalStatus({
      lastTemperature: undefined,
      lastLogAt,
      now,
    });
    expect(status3).toBe('disconnected');
  });

  it('should return disconnected if there is no last log', () => {
    const status = calculateDeviceOperationalStatus({
      lastTemperature: null,
      lastLogAt: null,
      now,
    });
    expect(status).toBe('disconnected');
  });
});
