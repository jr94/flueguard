import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceService } from './maintenance.service';
import { DeviceMaintenance } from './entities/device-maintenance.entity';
import { DevicesService } from '../devices/devices.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import {
  MAINTENANCE_PREVENTIVE_HOURS,
  MAINTENANCE_URGENT_HOURS,
} from './constants/maintenance.constants';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let maintenanceRepository: Repository<DeviceMaintenance>;
  let devicesService: DevicesService;
  let alertsService: AlertsService;
  let pushNotificationsService: PushNotificationsService;

  const mockMaintenanceRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockDevicesService = {
    findOne: jest.fn(),
    getUserDeviceLink: jest.fn(),
  };

  const mockAlertsService = {
    create: jest.fn(),
  };

  const mockPushNotificationsService = {
    sendAlertNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: getRepositoryToken(DeviceMaintenance),
          useValue: mockMaintenanceRepository,
        },
        {
          provide: DevicesService,
          useValue: mockDevicesService,
        },
        {
          provide: AlertsService,
          useValue: mockAlertsService,
        },
        {
          provide: PushNotificationsService,
          useValue: mockPushNotificationsService,
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    maintenanceRepository = module.get<Repository<DeviceMaintenance>>(
      getRepositoryToken(DeviceMaintenance),
    );
    devicesService = module.get<DevicesService>(DevicesService);
    alertsService = module.get<AlertsService>(AlertsService);
    pushNotificationsService = module.get<PushNotificationsService>(
      PushNotificationsService,
    );

    jest.clearAllMocks();
  });

  describe('checkAndNotifyMaintenance', () => {
    const deviceId = 1;
    const serialNumber = 'SN123';

    beforeEach(() => {
      mockDevicesService.findOne.mockResolvedValue({
        id: deviceId,
        serial_number: serialNumber,
      });
    });

    it('1. Caso bajo umbral preventivo (249h)', async () => {
      const usageSeconds = 249 * 3600;
      mockMaintenanceRepository.findOne.mockResolvedValue({
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: null,
        last_urgent_notified_at: null,
      });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).not.toHaveBeenCalled();
      expect(
        mockPushNotificationsService.sendAlertNotification,
      ).not.toHaveBeenCalled();
      expect(mockMaintenanceRepository.save).not.toHaveBeenCalled();
    });

    it('2. Caso alerta preventiva exacta (250h)', async () => {
      const usageSeconds = 250 * 3600;
      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: null,
        last_urgent_notified_at: null,
      };
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockAlertsService.create.mockResolvedValue({
        id: 100,
        alert_type: 'maintenance_preventive',
      });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'maintenance_preventive',
          alert_level: '1',
        }),
      );
      expect(
        mockPushNotificationsService.sendAlertNotification,
      ).toHaveBeenCalledWith(
        deviceId,
        expect.objectContaining({
          title: 'Limpieza preventiva recomendada',
          type: 'maintenance_preventive',
        }),
        serialNumber,
      );
      expect(maintenance.last_preventive_notified_at).toBeInstanceOf(Date);
      expect(maintenance.last_urgent_notified_at).toBeNull();
      expect(mockMaintenanceRepository.save).toHaveBeenCalled();
    });

    it('3. Caso preventiva repetida antes de 3 días', async () => {
      const usageSeconds = 250 * 3600;
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      mockMaintenanceRepository.findOne.mockResolvedValue({
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: oneDayAgo,
        last_urgent_notified_at: null,
      });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).not.toHaveBeenCalled();
      expect(
        mockPushNotificationsService.sendAlertNotification,
      ).not.toHaveBeenCalled();
    });

    it('4. Caso preventiva repetida después de 3 días', async () => {
      const usageSeconds = 250 * 3600;
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: fourDaysAgo,
        last_urgent_notified_at: null,
      };
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockAlertsService.create.mockResolvedValue({ id: 101 });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).toHaveBeenCalled();
      expect(
        mockPushNotificationsService.sendAlertNotification,
      ).toHaveBeenCalled();
      expect(mockMaintenanceRepository.save).toHaveBeenCalled();
    });

    it('4b. Caso 399h (preventivo, no urgente)', async () => {
      const usageSeconds = 399 * 3600;
      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: null,
        last_urgent_notified_at: null,
      };
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockAlertsService.create.mockResolvedValue({ id: 102 });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'maintenance_preventive',
        }),
      );
    });

    it('5. Caso urgente exacta (400h)', async () => {
      const usageSeconds = 400 * 3600;
      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: null,
        last_urgent_notified_at: null,
      };
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockAlertsService.create.mockResolvedValue({
        id: 200,
        alert_type: 'maintenance_urgent',
      });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'maintenance_urgent',
          alert_level: '2',
        }),
      );
      expect(
        mockPushNotificationsService.sendAlertNotification,
      ).toHaveBeenCalledWith(
        deviceId,
        expect.objectContaining({
          title: 'Mantención urgente requerida',
          type: 'maintenance_urgent',
        }),
        serialNumber,
      );
      expect(maintenance.last_urgent_notified_at).toBeInstanceOf(Date);
      expect(maintenance.last_preventive_notified_at).toBeNull();
    });

    it('6. Caso urgente tiene prioridad (450h)', async () => {
      const usageSeconds = 450 * 3600;
      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_preventive_notified_at: null,
        last_urgent_notified_at: null,
      };
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockAlertsService.create.mockResolvedValue({ id: 201 });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).toHaveBeenCalledTimes(1);
      expect(mockAlertsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'maintenance_urgent',
        }),
      );
    });

    it('7. Caso urgente repetida antes de 3 días', async () => {
      const usageSeconds = 400 * 3600;
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      mockMaintenanceRepository.findOne.mockResolvedValue({
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_urgent_notified_at: oneDayAgo,
      });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });

    it('8. Caso urgente repetida después de 3 días', async () => {
      const usageSeconds = 400 * 3600;
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: usageSeconds,
        last_urgent_notified_at: fourDaysAgo,
      };
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockAlertsService.create.mockResolvedValue({ id: 202 });

      await service.checkAndNotifyMaintenance(deviceId);

      expect(mockAlertsService.create).toHaveBeenCalled();
      expect(maintenance.last_urgent_notified_at).toBeInstanceOf(Date);
    });
  });

  describe('resetMaintenance', () => {
    it('9. Caso resetMaintenance', async () => {
      const deviceId = 1;
      const userId = 10;
      const maintenance = {
        device_id: deviceId,
        usage_seconds_accumulated: 1000 * 3600,
        last_notified_at: new Date(),
        last_preventive_notified_at: new Date(),
        last_urgent_notified_at: new Date(),
        last_reset_at: null,
        threshold_hours: 80,
      };

      mockDevicesService.getUserDeviceLink.mockResolvedValue({
        device_id: deviceId,
        user_id: userId,
      });
      mockMaintenanceRepository.findOne.mockResolvedValue(maintenance);
      mockMaintenanceRepository.save.mockResolvedValue(maintenance);

      await service.resetMaintenance(deviceId, userId);

      expect(maintenance.usage_seconds_accumulated).toBe(0);
      expect(maintenance.last_notified_at).toBeNull();
      expect(maintenance.last_preventive_notified_at).toBeNull();
      expect(maintenance.last_urgent_notified_at).toBeNull();
      expect(maintenance.last_reset_at).toBeInstanceOf(Date);
    });
  });

  describe('getOrCreate', () => {
    it('10. Caso getOrCreate estado ok', async () => {
      const deviceId = 1;
      mockMaintenanceRepository.findOne.mockResolvedValue({
        device_id: deviceId,
        usage_seconds_accumulated: 100 * 3600,
        threshold_hours: 80,
      });

      const result = await service.getOrCreate(deviceId);

      expect(result.maintenance_status).toBe('ok');
      expect(result.requires_preventive_maintenance).toBe(false);
      expect(result.requires_urgent_maintenance).toBe(false);
    });

    it('11. Caso getOrCreate estado preventive', async () => {
      const deviceId = 1;
      mockMaintenanceRepository.findOne.mockResolvedValue({
        device_id: deviceId,
        usage_seconds_accumulated: 250 * 3600,
        threshold_hours: 80,
      });

      const result = await service.getOrCreate(deviceId);

      expect(result.maintenance_status).toBe('preventive');
      expect(result.requires_preventive_maintenance).toBe(true);
      expect(result.requires_urgent_maintenance).toBe(false);
      expect(result.preventive_threshold_hours).toBe(250);
      expect(result.urgent_threshold_hours).toBe(400);
    });

    it('12. Caso getOrCreate estado urgent', async () => {
      const deviceId = 1;
      mockMaintenanceRepository.findOne.mockResolvedValue({
        device_id: deviceId,
        usage_seconds_accumulated: 400 * 3600,
        threshold_hours: 80,
      });

      const result = await service.getOrCreate(deviceId);

      expect(result.maintenance_status).toBe('urgent');
      expect(result.requires_preventive_maintenance).toBe(true);
      expect(result.requires_urgent_maintenance).toBe(true);
    });
  });

  describe('handleMaintenanceCron', () => {
    it('13. Caso cron diario', async () => {
      const records = [
        { device_id: 1, usage_seconds_accumulated: 100 * 3600 }, // Ignored (handled by DB query in real scenario)
        { device_id: 2, usage_seconds_accumulated: 300 * 3600 }, // Preventive
        { device_id: 3, usage_seconds_accumulated: 500 * 3600 }, // Urgent
      ];

      // In the real service, the query filters by >= 250h.
      // We simulate the repository returning only the relevant ones.
      mockMaintenanceRepository.find.mockResolvedValue([
        records[1],
        records[2],
      ]);

      const checkSpy = jest
        .spyOn(service, 'checkAndNotifyMaintenance')
        .mockResolvedValue(undefined);

      await service.handleMaintenanceCron();

      expect(mockMaintenanceRepository.find).toHaveBeenCalled();
      expect(checkSpy).toHaveBeenCalledWith(2);
      expect(checkSpy).toHaveBeenCalledWith(3);
      expect(checkSpy).toHaveBeenCalledTimes(2);
    });
  });
});
