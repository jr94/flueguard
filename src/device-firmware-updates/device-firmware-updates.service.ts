import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceFirmwareUpdate } from './entities/device-firmware-update.entity';
import { RequestOtaDto } from './dto/request-ota.dto';
import { CompleteOtaDto } from './dto/complete-ota.dto';
import { FailOtaDto } from './dto/fail-ota.dto';
import { CancelOtaDto } from './dto/cancel-ota.dto';
import { DevicesService } from '../devices/devices.service';
import { FirmwareService } from '../firmware/firmware.service';
import { compareVersion } from '../firmware/utils/compare-version.util';
import * as crypto from 'crypto';

@Injectable()
export class DeviceFirmwareUpdatesService {
  constructor(
    @InjectRepository(DeviceFirmwareUpdate)
    private readonly updatesRepository: Repository<DeviceFirmwareUpdate>,
    private readonly devicesService: DevicesService,
    private readonly firmwareService: FirmwareService,
  ) {}

  async requestOta(dto: RequestOtaDto, userId: number) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    const hasAccess = await this.devicesService.getUserDeviceLink(device.id, userId);
    if (!hasAccess || !hasAccess.owner) {
      throw new UnauthorizedException('No tienes permisos (debes ser el dueño) para solicitar actualizaciones para este dispositivo.');
    }

    if (device.firmware_version === dto.version) {
      throw new BadRequestException('El dispositivo ya tiene instalada la versión solicitada.');
    }

    if (device.firmware_version && compareVersion(device.firmware_version, dto.version) > 0) {
      throw new BadRequestException('La versión solicitada es menor que la versión actualmente instalada.');
    }

    // Verify version exists and get metadata
    const versions = await this.firmwareService.getVersions();
    const targetFirmware = versions.find(v => v.version === dto.version);

    if (!targetFirmware) {
      throw new NotFoundException(`Firmware version ${dto.version} not found in metadata`);
    }

    // Generate unique request ID
    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    const request_id = `ota_${dateStr}_${crypto.randomBytes(4).toString('hex')}`;

    // Use transaction to ensure consistency: cancel previous, insert new.
    await this.updatesRepository.manager.transaction(async transactionalEntityManager => {
      // Cancel any existing pending requests for this device
      await transactionalEntityManager.update(
        DeviceFirmwareUpdate,
        { device_id: device.id, status: 'pending' },
        { status: 'canceled' }
      );

      const update = transactionalEntityManager.create(DeviceFirmwareUpdate, {
        device_id: device.id,
        request_id,
        target_version: targetFirmware.version,
        file_url: targetFirmware.file,
        sha256: targetFirmware.sha256 || '',
        size_bytes: targetFirmware.size_bytes || 0,
        mandatory: dto.mandatory !== undefined ? dto.mandatory : (targetFirmware.mandatory || false),
        notes: dto.notes || targetFirmware.notes || '',
        status: 'pending'
      });

      await transactionalEntityManager.save(update);
    });

    return {
      success: true,
      message: 'Solicitud OTA registrada correctamente',
      request_id,
      device_id: device.id,
      version: targetFirmware.version
    };
  }

  async completeOta(dto: CompleteOtaDto) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    const update = await this.updatesRepository.findOne({
      where: { device_id: device.id, request_id: dto.request_id }
    });

    if (!update) {
      throw new NotFoundException(`OTA request ${dto.request_id} not found for this device`);
    }

    if (update.status !== 'pending') {
      throw new BadRequestException(`No se puede completar la OTA porque su estado actual es '${update.status}'.`);
    }

    // Update status and installed version in a transaction
    await this.updatesRepository.manager.transaction(async transactionalEntityManager => {
      update.status = 'completed';
      await transactionalEntityManager.save(update);

      // Update the device with the newly installed firmware version
      await this.devicesService.updateFirmwareVersion(device.id, update.target_version);
    });

    return { success: true, message: 'OTA marcada como completada' };
  }

  async failOta(dto: FailOtaDto) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    const update = await this.updatesRepository.findOne({
      where: { device_id: device.id, request_id: dto.request_id }
    });

    if (!update) {
      throw new NotFoundException(`OTA request ${dto.request_id} not found for this device`);
    }

    if (update.status !== 'pending') {
      throw new BadRequestException(`No se puede marcar como fallida porque su estado actual es '${update.status}'.`);
    }

    update.status = 'failed';
    update.reason = dto.reason || 'Unknown error';
    await this.updatesRepository.save(update);

    return { success: true, message: 'OTA marcada como fallida' };
  }

  async cancelOta(dto: CancelOtaDto, userId: number) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    const hasAccess = await this.devicesService.getUserDeviceLink(device.id, userId);
    if (!hasAccess || !hasAccess.owner) {
      throw new UnauthorizedException('No tienes permisos (debes ser el dueño) para cancelar actualizaciones para este dispositivo.');
    }

    const result = await this.updatesRepository.update(
      { device_id: device.id, status: 'pending' },
      { status: 'canceled' }
    );

    if (result.affected === 0) {
      return { success: true, message: 'No hay solicitudes OTA pendientes para cancelar' };
    }

    return { success: true, message: 'Solicitud OTA cancelada correctamente' };
  }

  async getPendingOtaForDevice(deviceId: number): Promise<DeviceFirmwareUpdate | null> {
    return this.updatesRepository.findOne({
      where: { device_id: deviceId, status: 'pending' }
    });
  }
}
