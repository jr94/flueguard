import { Test, TestingModule } from '@nestjs/testing';
import { DeviceFirmwareUpdatesService } from './device-firmware-updates.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceFirmwareUpdate } from './entities/device-firmware-update.entity';
import { Device } from '../devices/entities/device.entity';
import { DevicesService } from '../devices/devices.service';
import { FirmwareService } from '../firmware/firmware.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('DeviceFirmwareUpdatesService', () => {
  let service: DeviceFirmwareUpdatesService;
  let updatesRepository: any;
  let devicesService: any;

  const mockDevice = {
    id: 1,
    serial_number: 'FG-TE01-1234',
    model: 'FG-TE01',
    firmware_version: '2.0.5',
  };

  const mockUpdate = {
    id: 10,
    device_id: 1,
    request_id: 'ota_test_123',
    target_version: '2.0.6',
    file_url: 'http://test.bin',
    sha256: 'sha',
    size_bytes: 100,
    mandatory: false,
    status: 'pending',
    canTransition: (from: string, to: string) => true,
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(mockUpdate),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb) => {
          const mockEM = {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          };
          return cb(mockEM);
        }),
      },
    };

    const mockDevicesService = {
      findBySerialNumber: jest.fn().mockResolvedValue(mockDevice),
      updateDevicePartial: jest.fn().mockResolvedValue(undefined),
    };

    const mockFirmwareService = {
      getVersions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceFirmwareUpdatesService,
        { provide: getRepositoryToken(DeviceFirmwareUpdate), useValue: mockRepo },
        { provide: DevicesService, useValue: mockDevicesService },
        { provide: FirmwareService, useValue: mockFirmwareService },
      ],
    }).compile();

    service = module.get<DeviceFirmwareUpdatesService>(DeviceFirmwareUpdatesService);
    updatesRepository = module.get(getRepositoryToken(DeviceFirmwareUpdate));
    devicesService = module.get<DevicesService>(DevicesService);
  });

  describe('startOta', () => {
    it('should successfully transition from pending to in_progress', async () => {
      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
        model: 'FG-NEW-MODEL',
        firmware_version: '2.0.6',
      };

      const result = await service.startOta(dto);
      expect(result.success).toBe(true);
      expect(devicesService.updateDevicePartial).toHaveBeenCalledWith(mockDevice.id, {
        model: 'FG-NEW-MODEL',
        firmware_version: '2.0.6',
      });
      expect(updatesRepository.update).toHaveBeenCalled();
    });

    it('should be idempotent and return success if already in_progress', async () => {
      updatesRepository.findOne.mockResolvedValueOnce({
        ...mockUpdate,
        status: 'in_progress',
      });

      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
      };

      const result = await service.startOta(dto);
      expect(result.success).toBe(true);
      expect(result.message).toBe('OTA ya estaba en curso');
    });

    it('should be idempotent and return success if already completed', async () => {
      updatesRepository.findOne.mockResolvedValueOnce({
        ...mockUpdate,
        status: 'completed',
      });

      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
      };

      const result = await service.startOta(dto);
      expect(result.success).toBe(true);
      expect(result.message).toContain('OTA ya estaba finalizada');
    });
  });

  describe('completeOta', () => {
    it('should successfully complete the OTA and update device firmware version', async () => {
      updatesRepository.findOne.mockResolvedValueOnce({
        ...mockUpdate,
        status: 'in_progress',
      });

      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
        firmware_version: '2.0.6',
      };

      const result = await service.completeOta(dto);
      expect(result.success).toBe(true);
      expect(updatesRepository.manager.transaction).toHaveBeenCalled();
    });

    it('should be idempotent if already completed', async () => {
      updatesRepository.findOne.mockResolvedValueOnce({
        ...mockUpdate,
        status: 'completed',
      });

      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
      };

      const result = await service.completeOta(dto);
      expect(result.success).toBe(true);
      expect(result.message).toBe('OTA ya estaba completada');
    });
  });

  describe('failOta', () => {
    it('should transition to failed status', async () => {
      updatesRepository.findOne.mockResolvedValueOnce({
        ...mockUpdate,
        status: 'in_progress',
      });

      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
        reason: 'download_failed',
      };

      const result = await service.failOta(dto);
      expect(result.success).toBe(true);
      expect(updatesRepository.update).toHaveBeenCalledWith(
        { id: mockUpdate.id, status: 'in_progress' },
        { status: 'failed', reason: 'download_failed' },
      );
    });

    it('should be idempotent if already failed', async () => {
      updatesRepository.findOne.mockResolvedValueOnce({
        ...mockUpdate,
        status: 'failed',
      });

      const dto = {
        serial_number: 'FG-TE01-1234',
        request_id: 'ota_test_123',
        reason: 'another_error',
      };

      const result = await service.failOta(dto);
      expect(result.success).toBe(true);
      expect(result.message).toBe('OTA ya estaba fallida');
    });
  });
});
