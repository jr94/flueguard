import { Test, TestingModule } from '@nestjs/testing';
import { FirmwareService, FirmwareManifest } from './firmware.service';
import { DevicesService } from '../devices/devices.service';
import { NotFoundException } from '@nestjs/common';

describe('FirmwareService (OTA model filtering)', () => {
  let service: FirmwareService;
  let devicesService: any;

  const mockDeviceTe = {
    id: 1,
    serial_number: 'FG-TE01-1234',
    model: 'FG-TE01',
    firmware_version: '2.0.5',
  };

  const mockDeviceTb = {
    id: 2,
    serial_number: 'FG-TB01-5678',
    model: 'FG-TB01',
    firmware_version: '2.0.5',
  };

  const mockManifest: FirmwareManifest = {
    latest: {
      version: '2.0.6',
      file: 'http://test/fg-te01-2.0.6.bin',
      model: 'FG-TE01',
    },
    versions: [
      {
        version: '2.0.6',
        file: 'http://test/fg-te01-2.0.6.bin',
        model: 'FG-TE01',
        mandatory: false,
      },
      {
        version: '2.0.7',
        file: 'http://test/fg-tb01-2.0.7.bin',
        model: 'FG-TB01',
        mandatory: true,
      },
      {
        version: '2.0.5',
        file: 'http://test/old.bin',
        // no model, defaults to FG-TE01
      },
    ],
  };

  beforeEach(async () => {
    const mockDevicesService = {
      findBySerialNumber: jest.fn().mockImplementation(async (serial) => {
        if (serial === 'FG-TE01-1234') return mockDeviceTe;
        if (serial === 'FG-TB01-5678') return mockDeviceTb;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirmwareService,
        { provide: DevicesService, useValue: mockDevicesService },
      ],
    }).compile();

    service = module.get<FirmwareService>(FirmwareService);
    devicesService = module.get<DevicesService>(DevicesService);

    // Mock readLatestJson internally to use our mock manifest
    jest.spyOn(service as any, 'readLatestJson').mockResolvedValue(mockManifest);
    // Mock enrichFirmwareMetadata to just return input as-is to avoid accessing filesystem
    jest.spyOn(service as any, 'enrichFirmwareMetadata').mockImplementation(async (f) => f);
  });

  describe('checkUpdate', () => {
    it('should suggest the update to FG-TE01 since 2.0.6 > 2.0.5', async () => {
      const result = await service.checkUpdate({
        version: '2.0.5',
        model: 'FG-TE01',
      });
      expect(result.update).toBe(true);
      expect(result.latest_version).toBe('2.0.6');
    });

    it('should suggest the update to FG-TB01 since 2.0.7 > 2.0.5', async () => {
      const result = await service.checkUpdate({
        version: '2.0.5',
        model: 'FG-TB01',
      });
      expect(result.update).toBe(true);
      expect(result.latest_version).toBe('2.0.7');
    });

    it('should NOT suggest an update to FG-TB01 if it requests for FG-TE01 version', async () => {
      // Latest for FG-TB01 is 2.0.7, so if current version is 2.0.7, no update.
      const result = await service.checkUpdate({
        version: '2.0.7',
        model: 'FG-TB01',
      });
      expect(result.update).toBe(false);
    });

    it('should match versions without model if no model is provided', async () => {
      const result = await service.checkUpdate({
        version: '2.0.4',
      });
      expect(result.update).toBe(true);
      expect(result.latest_version).toBe('2.0.5'); // Matches 2.0.5 which has no model
    });

    it('should determine the model from serial number if model is not provided but serial is', async () => {
      const result = await service.checkUpdate({
        version: '2.0.5',
        serial_number: 'FG-TB01-5678',
      });
      expect(result.update).toBe(true);
      expect(result.latest_version).toBe('2.0.7'); // Correctly fetched from FG-TB01
    });
  });

  describe('checkUpdateBySerialNumber', () => {
    it('should call checkUpdate using device model and current version', async () => {
      const result = await service.checkUpdateBySerialNumber('FG-TB01-5678');
      expect(result.update).toBe(true);
      expect(result.latest_version).toBe('2.0.7');
    });

    it('should throw NotFoundException if device serial doesn exist', async () => {
      await expect(service.checkUpdateBySerialNumber('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
