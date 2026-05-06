import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSetting } from './entities/device-setting.entity';
import { UpdateDeviceSettingDto } from './dto/update-device-setting.dto';
import { DevicesService } from '../devices/devices.service';
import { DeviceFirmwareUpdatesService } from '../device-firmware-updates/device-firmware-updates.service';
import { Device } from '../devices/entities/device.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';


@Injectable()
export class DeviceSettingsService {
  constructor(
    @InjectRepository(DeviceSetting)
    private readonly deviceSettingRepository: Repository<DeviceSetting>,
    private readonly devicesService: DevicesService,
    private readonly deviceFirmwareUpdatesService: DeviceFirmwareUpdatesService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async findByDeviceId(deviceId: number): Promise<any> {
    const setting = await this.deviceSettingRepository.findOne({ where: { device_id: deviceId } });
    if (!setting) {
      throw new NotFoundException(`Settings for device ID ${deviceId} not found`);
    }

    const device = await this.devicesService.findOne(deviceId);

    return {
      ...setting,
      device_name: device.device_name,
      region_id: device.region_id,
      comuna_id: device.comuna_id,
      direccion: device.direccion,
    };
  }

  async findBySerialNumber(serialNumber: string): Promise<any> {
    // 1. Find device by serial number
    const device = await this.devicesService.findBySerialNumber(serialNumber);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${serialNumber} not found`);
    }

    // 2. Find and return the settings
    const setting = await this.deviceSettingRepository.findOne({ where: { device_id: device.id } });
    if (!setting) {
      throw new NotFoundException(`Settings for device with serial number ${serialNumber} not found`);
    }

    // 3. Find pending OTA request if any
    const otaRequest = await this.deviceFirmwareUpdatesService.getPendingOtaForDevice(device.id);

    return {
      ...setting,
      device_name: device.device_name,
      region_id: device.region_id,
      comuna_id: device.comuna_id,
      direccion: device.direccion,
      firmware_update: otaRequest ? {
        requested: true,
        status: otaRequest.status,
        request_id: otaRequest.request_id,
        version: otaRequest.target_version,
        file: otaRequest.file_url,
        sha256: otaRequest.sha256,
        size_bytes: otaRequest.size_bytes,
        mandatory: otaRequest.mandatory,
        notes: otaRequest.notes || ''
      } : {
        requested: false
      }
    } as any;
  }

  async findBySerialNumberWithUserPermissions(serialNumber: string, userId: number): Promise<any> {
    const setting = await this.findBySerialNumber(serialNumber);
    const link = await this.devicesService.getUserDeviceLink(setting.device_id, userId);

    if (!link) {
      throw new NotFoundException(`User has no access to device with serial number ${serialNumber}`);
    }

    const subscriptionStatus = await this.subscriptionsService.getDeviceSubscriptionStatus(setting.device_id);
    
    let planInfo = { id: null, code: 'basic', name: 'FlueGuard Básico' };
    if (subscriptionStatus && subscriptionStatus.is_active && subscriptionStatus.plan) {
      planInfo = {
        id: subscriptionStatus.plan.id,
        code: subscriptionStatus.plan.code,
        name: subscriptionStatus.plan.name
      };
    }

    return {
      ...setting,
      owner: link.owner ? 1 : 0,
      edit: link.edit ? 1 : 0,
      plan: planInfo,
    };
  }

  async update(deviceId: number, updateDto: UpdateDeviceSettingDto): Promise<any> {
    const { device_name, region_id, comuna_id, direccion, ...settingsDto } = updateDto;

    const deviceUpdatePayload: Partial<Device> = {};

    if (device_name !== undefined) {
      deviceUpdatePayload.device_name = device_name;
    }

    if (region_id !== undefined) {
      deviceUpdatePayload.region_id = region_id;
    }

    if (comuna_id !== undefined) {
      deviceUpdatePayload.comuna_id = comuna_id;
    }

    if (direccion !== undefined) {
      deviceUpdatePayload.direccion = direccion;
    }

    if (Object.keys(deviceUpdatePayload).length > 0) {
      await this.devicesService.updateDevicePartial(deviceId, deviceUpdatePayload);
    }

    let setting = await this.deviceSettingRepository.findOne({ where: { device_id: deviceId } });

    if (setting) {
      // 2. Si existe: actualizar los campos
      Object.assign(setting, settingsDto);
      setting = await this.deviceSettingRepository.save(setting);
    } else {
      // 3. Si NO existe: crear un nuevo registro
      // Este método lanzará NotFoundException automáticamente si no existe el dispositivo
      const device = await this.devicesService.findOne(deviceId);

      setting = this.deviceSettingRepository.create({
        device_id: deviceId,
        ...settingsDto,
      });

      // 4. Guardar usando TypeORM repository.save()
      setting = await this.deviceSettingRepository.save(setting);
    }

    const updatedDevice = await this.devicesService.findOne(deviceId);

    return {
      ...setting,
      device_name: updatedDevice.device_name,
      region_id: updatedDevice.region_id,
      comuna_id: updatedDevice.comuna_id,
      direccion: updatedDevice.direccion,
      updated_at: updatedDevice.updated_at,
    };
  }
}
