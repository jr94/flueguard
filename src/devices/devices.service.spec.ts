import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { UserDevice } from './entities/user-device.entity';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';

describe('DevicesService (operational status enrichment)', () => {
  let service: DevicesService;
  let deviceRepository: any;
  let dataSource: any;

  const mockDevice = {
    id: 123,
    serial_number: 'FG-ESP32-9999',
    device_name: 'Test Stove',
    status: 'online',
    last_connection: new Date(),
  };

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockDevice]),
  };

  beforeEach(async () => {
    const mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOne: jest.fn().mockResolvedValue(mockDevice),
    };

    const mockTempLogQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    const mockTempLogRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockTempLogQueryBuilder),
    };

    const mockDataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === TemperatureLog) {
          return mockTempLogRepository;
        }
        return {};
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: getRepositoryToken(Device), useValue: mockRepo },
        { provide: getRepositoryToken(UserDevice), useValue: {} },
        { provide: getRepositoryToken(DeviceSetting), useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
    deviceRepository = module.get(getRepositoryToken(Device));
    dataSource = module.get(getDataSourceToken());
  });

  it('should return connected status if last log is < 10 mins ago in findByUserId', async () => {
    const lastLogTime = new Date(Date.now() - 3 * 60 * 1000);
    const mockTempLogRepo = dataSource.getRepository(TemperatureLog);
    const mockQB = mockTempLogRepo.createQueryBuilder();
    mockQB.getMany.mockResolvedValue([
      {
        id: 1,
        device_id: 123,
        temperature: 22.0,
        created_at: lastLogTime,
      },
    ]);

    const result = await service.findByUserId(1);

    expect(result).toHaveLength(1);
    expect(result[0].connection_state).toBe('connected');
    expect(result[0].minutes_since_last_log).toBeLessThanOrEqual(3);
    expect(result[0].last_temperature).toBe(22.0);
    expect(result[0].last_log_time).toEqual(lastLogTime);
  });

  it('should return cold_idle status if last log is >= 10 mins ago and temp < 30 in enrichDeviceWithStatus', async () => {
    const lastLogTime = new Date(Date.now() - 20 * 60 * 1000);
    const mockTempLogRepo = dataSource.getRepository(TemperatureLog);
    mockTempLogRepo.findOne.mockResolvedValue({
      temperature: 25.0,
      created_at: lastLogTime,
    });

    const result = await service.enrichDeviceWithStatus(mockDevice as any);

    expect(result.connection_state).toBe('cold_idle');
    expect(result.minutes_since_last_log).toBe(20);
    expect(result.last_temperature).toBe(25.0);
    expect(result.last_log_time).toEqual(lastLogTime);
  });
});
