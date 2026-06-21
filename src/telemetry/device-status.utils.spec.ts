import { calculateDeviceOperationalStatus } from './device-status.utils';

describe('calculateDeviceOperationalStatus', () => {
  const now = new Date('2026-06-14T18:00:00.000Z');

  // Cold idle
  it('should return cold_idle if last log was 2 minutes ago and temperature is 24°C', () => {
    const lastLogAt = new Date('2026-06-14T17:58:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 24,
      lastLogAt,
      now,
    });
    expect(status).toBe('cold_idle');
  });

  it('should return cold_idle if last log was 30 minutes ago and temperature is 28°C', () => {
    const lastLogAt = new Date('2026-06-14T17:30:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 28,
      lastLogAt,
      now,
    });
    expect(status).toBe('cold_idle');
  });

  it('should return cold_idle if last log was 60 minutes ago and temperature is 30°C', () => {
    const lastLogAt = new Date('2026-06-14T17:00:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 30,
      lastLogAt,
      now,
    });
    expect(status).toBe('cold_idle');
  });

  // Connected
  it('should return connected if last log was 2 minutes ago and temperature is 35°C', () => {
    const lastLogAt = new Date('2026-06-14T17:58:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 35,
      lastLogAt,
      now,
    });
    expect(status).toBe('connected');
  });

  it('should return connected if last log was 8 minutes ago and temperature is 180°C', () => {
    const lastLogAt = new Date('2026-06-14T17:52:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 180,
      lastLogAt,
      now,
    });
    expect(status).toBe('connected');
  });

  it('should return connected if last log was 5 minutes ago and temperature is 30.1°C', () => {
    const lastLogAt = new Date('2026-06-14T17:55:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 30.1,
      lastLogAt,
      now,
    });
    expect(status).toBe('connected');
  });

  // Disconnected
  it('should return disconnected if there is no last log', () => {
    const status = calculateDeviceOperationalStatus({
      lastTemperature: null,
      lastLogAt: null,
      now,
    });
    expect(status).toBe('disconnected');
  });

  it('should return disconnected if last log date is invalid', () => {
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 25,
      lastLogAt: 'invalid-date',
      now,
    });
    expect(status).toBe('disconnected');
  });

  it('should return disconnected if temperature is invalid or NaN', () => {
    const lastLogAt = new Date('2026-06-14T17:55:00.000Z');
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

  it('should return disconnected if last log was 10 minutes ago and temperature is 30.1°C', () => {
    const lastLogAt = new Date('2026-06-14T17:50:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 30.1,
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

  it('should return disconnected if last log was 61 minutes ago and temperature is 25°C', () => {
    const lastLogAt = new Date('2026-06-14T16:59:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 25,
      lastLogAt,
      now,
    });
    expect(status).toBe('disconnected');
  });

  it('should return disconnected if last log was 90 minutes ago and temperature is 30°C', () => {
    const lastLogAt = new Date('2026-06-14T16:30:00.000Z');
    const status = calculateDeviceOperationalStatus({
      lastTemperature: 30,
      lastLogAt,
      now,
    });
    expect(status).toBe('disconnected');
  });
});
