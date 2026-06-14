import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryService } from './telemetry.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemperatureLog } from './entities/temperature-log.entity';
import { DevicesService } from '../devices/devices.service';
import { DeviceSettingsService } from '../device-settings/device-settings.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MetricsService } from '../metrics/metrics.service';

describe('TelemetryService (operational status integration)', () => {
  let service: TelemetryService;
  let devicesService: DevicesService;
  let temperatureLogRepository: any;
  let deviceSettingsService: DeviceSettingsService;
  let subscriptionsService: SubscriptionsService;

  const mockDevice = {
    id: 123,
    serial_number: 'FG-ESP32-9999',
    device_name: 'Test Stove',
    status: 'online',
    last_connection: new Date(),
  };

  const mockSettings = {
    sound_alarm_temp_low: true,
    threshold_1: 90,
    threshold_2: 230,
    threshold_3: 350,
  };

  beforeEach(async () => {
    const mockRepo = {
      find: jest.fn(),
    };

    const mockDevicesService = {
      findByUserId: jest.fn().mockResolvedValue([mockDevice]),
      findAll: jest.fn(),
    };

    const mockDeviceSettingsService = {
      findByDeviceId: jest.fn().mockResolvedValue(mockSettings),
    };

    const mockSubscriptionsService = {
      getMySubscription: jest.fn().mockResolvedValue({
        is_active: true,
        plan: { code: 'plus', name: 'FlueGuard Plus' },
        status: 'active',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        { provide: getRepositoryToken(TemperatureLog), useValue: mockRepo },
        { provide: DevicesService, useValue: mockDevicesService },
        { provide: DeviceSettingsService, useValue: mockDeviceSettingsService },
        { provide: AlertsService, useValue: {} },
        { provide: PushNotificationsService, useValue: {} },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
        { provide: MetricsService, useValue: {} },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    devicesService = module.get<DevicesService>(DevicesService);
    temperatureLogRepository = module.get(getRepositoryToken(TemperatureLog));
    deviceSettingsService = module.get<DeviceSettingsService>(
      DeviceSettingsService,
    );
    subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('should return connected status if last log is < 10 minutes ago', async () => {
    // 5 minutes ago
    const lastLogTime = new Date(Date.now() - 5 * 60 * 1000);
    temperatureLogRepository.find.mockResolvedValue([
      { temperature: 35.5, created_at: lastLogTime },
      {
        temperature: 34.0,
        created_at: new Date(lastLogTime.getTime() - 60000),
      },
    ]);

    const result = await service.getLastTempForUserDevices(1);

    expect(result.devices).toHaveLength(1);
    const item = result.devices[0];

    // Compatibility check (root level)
    expect(item.connection_state).toBe('connected');
    expect(item.minutes_since_last_log).toBeLessThanOrEqual(5);
    expect(item.device_id).toBe(mockDevice.id);
    expect(item.serial_number).toBe(mockDevice.serial_number);
    expect(item.device_name).toBe(mockDevice.device_name);
    expect(item.temperature).toBe(35.5);
    expect(item.last_log_at).toEqual(lastLogTime);
    expect(item.status).toBe('online');

    // Compatibility check (nested device level)
    expect(item.device.connection_state).toBe('connected');
    expect(item.device.minutes_since_last_log).toBeLessThanOrEqual(5);
  });

  it('should return cold_idle status if last log is >= 10 minutes ago and temperature is < 30°C', async () => {
    // 15 minutes ago
    const lastLogTime = new Date(Date.now() - 15 * 60 * 1000);
    temperatureLogRepository.find.mockResolvedValue([
      { temperature: 24.8, created_at: lastLogTime },
    ]);

    const result = await service.getLastTempForUserDevices(1);

    expect(result.devices).toHaveLength(1);
    const item = result.devices[0];

    expect(item.connection_state).toBe('cold_idle');
    expect(item.minutes_since_last_log).toBe(15);
    expect(item.device.connection_state).toBe('cold_idle');
    expect(item.device.minutes_since_last_log).toBe(15);
  });

  it('should return disconnected status if last log is >= 10 minutes ago and temperature is >= 30°C', async () => {
    // 15 minutes ago, 35°C
    const lastLogTime = new Date(Date.now() - 15 * 60 * 1000);
    temperatureLogRepository.find.mockResolvedValue([
      { temperature: 35.0, created_at: lastLogTime },
    ]);

    const result = await service.getLastTempForUserDevices(1);

    expect(result.devices).toHaveLength(1);
    const item = result.devices[0];

    expect(item.connection_state).toBe('disconnected');
    expect(item.minutes_since_last_log).toBe(15);
  });
});
