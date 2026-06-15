import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSetting } from './entities/device-setting.entity';
import { UpdateDeviceSettingDto } from './dto/update-device-setting.dto';
import { DevicesService } from '../devices/devices.service';
import { DeviceFirmwareUpdatesService } from '../device-firmware-updates/device-firmware-updates.service';
import { Device } from '../devices/entities/device.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { compareVersion } from '../firmware/utils/compare-version.util';
import { GetDeviceSettingsQueryDto } from './dto/get-device-settings-query.dto';

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
    const setting = await this.deviceSettingRepository.findOne({
      where: { device_id: deviceId },
    });
    if (!setting) {
      throw new NotFoundException(
        `Settings for device ID ${deviceId} not found`,
      );
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

  async findBySerialNumber(serialNumber: string, query?: GetDeviceSettingsQueryDto): Promise<any> {
    // 1. Find device by serial number
    const device = await this.devicesService.findBySerialNumber(serialNumber);
    if (!device) {
      throw new NotFoundException(
        `Device with serial number ${serialNumber} not found`,
      );
    }

    const model = query?.model;
    const firmwareVersion = query?.firmware_version;

    const updatePayload: Partial<Device> = {};

    const normalizedModel =
      typeof model === 'string' && model.trim().length > 0
        ? model.trim()
        : undefined;

    const normalizedFirmwareVersion =
      typeof firmwareVersion === 'string' && firmwareVersion.trim().length > 0
        ? firmwareVersion.trim()
        : undefined;

    if (
      normalizedModel !== undefined &&
      device.model !== normalizedModel
    ) {
      updatePayload.model = normalizedModel;
    }

    if (
      normalizedFirmwareVersion !== undefined &&
      device.firmware_version !== normalizedFirmwareVersion
    ) {
      updatePayload.firmware_version = normalizedFirmwareVersion;
    }

    if (Object.keys(updatePayload).length > 0) {
      await this.devicesService.updateDevicePartial(device.id, updatePayload);

      if (updatePayload.model !== undefined) {
        device.model = updatePayload.model;
      }

      if (updatePayload.firmware_version !== undefined) {
        device.firmware_version = updatePayload.firmware_version;
      }
    }

    // Log settings request
    console.log(`[SettingsRequest] Serial: ${serialNumber}, Model Recibido: ${model || 'N/A'}, Model Efectivo: ${device.model || 'N/A'}, Version Recibida: ${firmwareVersion || 'N/A'}, Version Actual: ${device.firmware_version || 'N/A'}`);

    // 2. Find and return the settings
    const setting = await this.deviceSettingRepository.findOne({
      where: { device_id: device.id },
    });
    if (!setting) {
      throw new NotFoundException(
        `Settings for device with serial number ${serialNumber} not found`,
      );
    }

    // 3. Find pending OTA request if any
    const otaRequest =
      await this.deviceFirmwareUpdatesService.getPendingOtaForDevice(device.id);

    const hasAlreadyUpdated =
      otaRequest &&
      device.firmware_version &&
      compareVersion(device.firmware_version, otaRequest.target_version) >= 0;

    if (hasAlreadyUpdated) {
      await this.deviceFirmwareUpdatesService.autoCompleteOta(otaRequest.id);
    }

    return {
      ...setting,
      device_name: device.device_name,
      region_id: device.region_id,
      comuna_id: device.comuna_id,
      direccion: device.direccion,
      firmware_update:
        otaRequest && !hasAlreadyUpdated
          ? {
              requested: true,
              status: otaRequest.status,
              request_id: otaRequest.request_id,
              model: device.model || null,
              version: otaRequest.target_version,
              file: otaRequest.file_url,
              sha256: otaRequest.sha256,
              size_bytes: otaRequest.size_bytes,
              mandatory: otaRequest.mandatory,
              notes: otaRequest.notes || '',
            }
          : {
              requested: false,
            },
    } as any;
  }

  async findBySerialNumberWithUserPermissions(
    serialNumber: string,
    userId: number,
  ): Promise<any> {
    const setting = await this.findBySerialNumber(serialNumber);
    const link = await this.devicesService.getUserDeviceLink(
      setting.device_id,
      userId,
    );

    if (!link) {
      throw new NotFoundException(
        `User has no access to device with serial number ${serialNumber}`,
      );
    }

    const planInfo =
      await this.subscriptionsService.getEffectivePlanByUserId(userId);

    console.log(
      `[DeviceSettings] DeviceID: ${setting.device_id}, UserID: ${userId}`,
    );
    console.log(
      `[DeviceSettings] Plan ID: ${planInfo.id}, Code: ${planInfo.code}, Name: ${planInfo.name}`,
    );
    console.log(`[DeviceSettings] planName final: ${planInfo.code}`);

    return {
      ...setting,
      owner: link.owner ? 1 : 0,
      edit: link.edit ? 1 : 0,
      plan: planInfo,
      planName: planInfo.code,
    };
  }

  async update(
    deviceId: number,
    updateDto: UpdateDeviceSettingDto,
    userId: number,
  ): Promise<any> {
    const link = await this.devicesService.getUserDeviceLink(deviceId, userId);
    if (!link || (!link.owner && !link.edit)) {
      throw new ForbiddenException(
        'No tienes permisos para modificar la configuración de este equipo.',
      );
    }

    if (updateDto.sound_alarm_temp_low !== undefined) {
      const hasFeature = await this.subscriptionsService.userHasFeature(
        userId,
        'low_temperature_alert',
      );
      if (!hasFeature.has_feature) {
        throw new ForbiddenException(
          'Esta funcionalidad requiere plan Plus o Pro.',
        );
      }
    }

    const {
      device_name,
      region_id,
      comuna_id,
      direccion,
      timezone: rawTimezone,
      ...settingsDto
    } = updateDto;

    const timezone = this.validateTimezone(rawTimezone);

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
      await this.devicesService.updateDevicePartial(
        deviceId,
        deviceUpdatePayload,
      );
    }

    let setting = await this.deviceSettingRepository.findOne({
      where: { device_id: deviceId },
    });

    if (setting) {
      // 2. Si existe: actualizar los campos
      Object.assign(setting, settingsDto);
      if (timezone) setting.timezone = timezone;
      setting = await this.deviceSettingRepository.save(setting);
    } else {
      // 3. Si NO existe: crear un nuevo registro
      // Este método lanzará NotFoundException automáticamente si no existe el dispositivo
      const device = await this.devicesService.findOne(deviceId);

      setting = this.deviceSettingRepository.create({
        device_id: deviceId,
        ...settingsDto,
        timezone: timezone || 'America/Santiago',
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

  private validateTimezone(timezone?: string): string | undefined {
    if (timezone === undefined || timezone === null) {
      return undefined;
    }

    const cleanTimezone = timezone.trim();

    if (!cleanTimezone) {
      throw new BadRequestException('Zona horaria inválida.');
    }

    const test = DateTime.now().setZone(cleanTimezone);

    if (!test.isValid) {
      throw new BadRequestException('Zona horaria inválida.');
    }

    return cleanTimezone;
  }
}
