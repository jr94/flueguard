import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceFirmwareUpdate } from './entities/device-firmware-update.entity';
import { RequestOtaDto } from './dto/request-ota.dto';
import { StartOtaDto } from './dto/start-ota.dto';
import { CompleteOtaDto } from './dto/complete-ota.dto';
import { FailOtaDto } from './dto/fail-ota.dto';
import { CancelOtaDto } from './dto/cancel-ota.dto';
import { DevicesService } from '../devices/devices.service';
import { Device } from '../devices/entities/device.entity';
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

  private canTransition(fromStatus: string, toStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      pending: ['in_progress', 'completed', 'failed', 'canceled'],
      in_progress: ['completed', 'failed'],
      completed: [],
      failed: [],
      canceled: [],
    };
    return validTransitions[fromStatus]?.includes(toStatus) ?? false;
  }

  async requestOta(dto: RequestOtaDto, userId: number) {
    const device = await this.devicesService.findBySerialNumber(
      dto.serial_number,
    );
    if (!device) {
      throw new NotFoundException(
        `Device with serial number ${dto.serial_number} not found`,
      );
    }

    const hasAccess = await this.devicesService.getUserDeviceLink(
      device.id,
      userId,
    );
    if (!hasAccess || !hasAccess.owner) {
      throw new UnauthorizedException(
        'No tienes permisos (debes ser el dueño) para solicitar actualizaciones para este dispositivo.',
      );
    }

    if (device.firmware_version === dto.version) {
      throw new BadRequestException(
        'El dispositivo ya tiene instalada la versión solicitada.',
      );
    }

    if (
      device.firmware_version &&
      compareVersion(device.firmware_version, dto.version) > 0
    ) {
      throw new BadRequestException(
        'La versión solicitada es menor que la versión actualmente instalada.',
      );
    }

    const inProgressOta = await this.updatesRepository.findOne({
      where: { device_id: device.id, status: 'in_progress' },
    });
    if (inProgressOta) {
      throw new ConflictException(
        'Ya existe una actualización en curso para este dispositivo',
      );
    }

    // Verify version exists and get metadata
    const versions = await this.firmwareService.getVersions();
    const targetFirmware = versions.find((v) => v.version === dto.version);

    if (!targetFirmware) {
      throw new NotFoundException(
        `Firmware version ${dto.version} not found in metadata`,
      );
    }

    // Generate unique request ID
    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    const request_id = `ota_${dateStr}_${crypto.randomBytes(4).toString('hex')}`;

    // Use transaction to ensure consistency: cancel previous, insert new.
    await this.updatesRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Cancel any existing pending requests for this device
        await transactionalEntityManager.update(
          DeviceFirmwareUpdate,
          { device_id: device.id, status: 'pending' },
          { status: 'canceled' },
        );

        const update = transactionalEntityManager.create(DeviceFirmwareUpdate, {
          device_id: device.id,
          request_id,
          target_version: targetFirmware.version,
          model: device.model || null,
          file_url: targetFirmware.file,
          sha256: targetFirmware.sha256 || '',
          size_bytes: targetFirmware.size_bytes || 0,
          mandatory:
            dto.mandatory !== undefined
              ? dto.mandatory
              : targetFirmware.mandatory || false,
          notes: dto.notes || targetFirmware.notes || '',
          status: 'pending',
        });

        await transactionalEntityManager.save(update);
      },
    );

    return {
      success: true,
      message: 'Solicitud OTA registrada correctamente',
      request_id,
      device_id: device.id,
      version: targetFirmware.version,
    };
  }

  /**
   * Solicita OTA desde el portal — sin validación de user_devices.
   * El portal tiene acceso administrativo a todos los dispositivos.
   */
  async requestOtaFromPortal(
    serial_number: string,
    version: string,
    mandatory?: boolean,
    notes?: string,
  ) {
    const device = await this.devicesService.findBySerialNumber(serial_number);
    if (!device) {
      throw new NotFoundException(
        `Device with serial number ${serial_number} not found`,
      );
    }

    if (device.firmware_version === version) {
      throw new BadRequestException(
        'El dispositivo ya tiene instalada la versión solicitada.',
      );
    }

    if (
      device.firmware_version &&
      compareVersion(device.firmware_version, version) > 0
    ) {
      throw new BadRequestException(
        'La versión solicitada es menor que la versión actualmente instalada.',
      );
    }

    const inProgressOta = await this.updatesRepository.findOne({
      where: { device_id: device.id, status: 'in_progress' },
    });
    if (inProgressOta) {
      throw new ConflictException(
        'Ya existe una actualización en curso para este dispositivo',
      );
    }

    const versions = await this.firmwareService.getVersions();
    const targetFirmware = versions.find((v) => v.version === version);
    if (!targetFirmware) {
      throw new NotFoundException(
        `Firmware version ${version} not found in metadata`,
      );
    }

    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    const request_id = `ota_${dateStr}_${crypto.randomBytes(4).toString('hex')}`;

    await this.updatesRepository.manager.transaction(
      async (transactionalEntityManager) => {
        await transactionalEntityManager.update(
          DeviceFirmwareUpdate,
          { device_id: device.id, status: 'pending' },
          { status: 'canceled' },
        );

        const update = transactionalEntityManager.create(DeviceFirmwareUpdate, {
          device_id: device.id,
          request_id,
          target_version: targetFirmware.version,
          model: device.model || null,
          file_url: targetFirmware.file,
          sha256: targetFirmware.sha256 || '',
          size_bytes: targetFirmware.size_bytes || 0,
          mandatory:
            mandatory !== undefined
              ? mandatory
              : targetFirmware.mandatory || false,
          notes: notes || targetFirmware.notes || '',
          status: 'pending',
        });

        await transactionalEntityManager.save(update);
      },
    );

    return {
      success: true,
      message: 'Solicitud OTA registrada correctamente desde el portal',
      request_id,
      device_id: device.id,
      version: targetFirmware.version,
    };
  }

  async startOta(dto: StartOtaDto) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    // Update model and/or firmware_version if provided
    const updatePayload: Partial<Device> = {};

    const normalizedModel =
      typeof dto.model === 'string' && dto.model.trim().length > 0
        ? dto.model.trim()
        : undefined;

    const normalizedFirmwareVersion =
      typeof dto.firmware_version === 'string' && dto.firmware_version.trim().length > 0
        ? dto.firmware_version.trim()
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

    const update = await this.updatesRepository.findOne({
      where: { device_id: device.id, request_id: dto.request_id },
    });

    if (!update) {
      throw new NotFoundException(`OTA request ${dto.request_id} not found for this device`);
    }

    // Log the event
    console.log(
      `[OTA Report] Serial: ${dto.serial_number}, Model Recibido: ${
        dto.model || 'N/A'
      }, Model Efectivo: ${device.model || 'N/A'}, Version Recibida: ${
        dto.firmware_version || 'N/A'
      }, Version Actual: ${device.firmware_version || 'N/A'}, Version Objetivo: ${
        update.target_version
      }, RequestId: ${dto.request_id}, Estado Reportado: start (OTA status in DB: ${update.status})`,
    );

    if (update.status === 'in_progress') {
      return { success: true, message: 'OTA ya estaba en curso' };
    }

    if (update.status === 'completed' || update.status === 'failed' || update.status === 'canceled') {
      return {
        success: true,
        message: `OTA ya estaba finalizada en estado ${update.status}`,
      };
    }

    if (!this.canTransition(update.status, 'in_progress')) {
      throw new ConflictException(
        `No se puede iniciar la OTA porque su estado actual es '${update.status}'.`,
      );
    }

    const result = await this.updatesRepository.update(
      { id: update.id, status: 'pending' },
      { status: 'in_progress' },
    );

    if (result.affected === 0) {
      throw new ConflictException(
        `Conflicto de concurrencia: la OTA ya no está en estado pending.`,
      );
    }

    return { success: true, message: 'OTA iniciada correctamente' };
  }

  async completeOta(dto: CompleteOtaDto) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    // Update model and/or firmware_version if provided
    const updatePayload: Partial<Device> = {};

    const normalizedModel =
      typeof dto.model === 'string' && dto.model.trim().length > 0
        ? dto.model.trim()
        : undefined;

    const normalizedFirmwareVersion =
      typeof dto.firmware_version === 'string' && dto.firmware_version.trim().length > 0
        ? dto.firmware_version.trim()
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

    const update = await this.updatesRepository.findOne({
      where: { device_id: device.id, request_id: dto.request_id },
    });

    if (!update) {
      throw new NotFoundException(`OTA request ${dto.request_id} not found for this device`);
    }

    // Log the event
    console.log(
      `[OTA Report] Serial: ${dto.serial_number}, Model Recibido: ${
        dto.model || 'N/A'
      }, Model Efectivo: ${device.model || 'N/A'}, Version Recibida: ${
        dto.firmware_version || 'N/A'
      }, Version Actual: ${device.firmware_version || 'N/A'}, Version Objetivo: ${
        update.target_version
      }, RequestId: ${dto.request_id}, Estado Reportado: complete (OTA status in DB: ${update.status})`,
    );

    if (update.status === 'completed') {
      return { success: true, message: 'OTA ya estaba completada' };
    }

    if (update.status === 'failed' || update.status === 'canceled') {
      return {
        success: true,
        message: `OTA ya estaba finalizada en estado ${update.status}`,
      };
    }

    if (!this.canTransition(update.status, 'completed')) {
      throw new ConflictException(
        `No se puede completar la OTA porque su estado actual es '${update.status}'.`,
      );
    }

    try {
      // Update status and installed version in a short, clean transaction
      await this.updatesRepository.manager.transaction(async (em) => {
        const result = await em.update(
          DeviceFirmwareUpdate,
          { id: update.id, status: update.status },
          { status: 'completed' },
        );
        if (result.affected === 0) {
          throw new ConflictException(
            `Conflicto de concurrencia: la OTA ya no está en el estado esperado.`,
          );
        }

        const deviceUpdatePayload: any = {
          firmware_version: dto.firmware_version || update.target_version,
        };
        if (dto.model) {
          deviceUpdatePayload.model = dto.model;
        }

        await em.update(Device, device.id, deviceUpdatePayload);
      });
    } catch (error: any) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
        // Fallback: Retry once without transaction if locks are exhausted
        const result = await this.updatesRepository.update(
          { id: update.id, status: update.status },
          { status: 'completed' },
        );
        if (result.affected && result.affected > 0) {
          const deviceUpdatePayload: any = {
            firmware_version: dto.firmware_version || update.target_version,
          };
          if (dto.model) {
            deviceUpdatePayload.model = dto.model;
          }
          await this.devicesService.updateDevicePartial(device.id, deviceUpdatePayload);
        }
      } else {
        throw error;
      }
    }

    return { success: true, message: 'OTA marcada como completada' };
  }

  async failOta(dto: FailOtaDto) {
    const device = await this.devicesService.findBySerialNumber(dto.serial_number);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${dto.serial_number} not found`);
    }

    // Update model and/or firmware_version if provided
    const updatePayload: Partial<Device> = {};

    const normalizedModel =
      typeof dto.model === 'string' && dto.model.trim().length > 0
        ? dto.model.trim()
        : undefined;

    const normalizedFirmwareVersion =
      typeof dto.firmware_version === 'string' && dto.firmware_version.trim().length > 0
        ? dto.firmware_version.trim()
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

    const update = await this.updatesRepository.findOne({
      where: { device_id: device.id, request_id: dto.request_id },
    });

    if (!update) {
      throw new NotFoundException(`OTA request ${dto.request_id} not found for this device`);
    }

    // Log the event
    console.log(
      `[OTA Report] Serial: ${dto.serial_number}, Model Recibido: ${
        dto.model || 'N/A'
      }, Model Efectivo: ${device.model || 'N/A'}, Version Recibida: ${
        dto.firmware_version || 'N/A'
      }, Version Actual: ${device.firmware_version || 'N/A'}, Version Objetivo: ${
        update.target_version
      }, RequestId: ${dto.request_id}, Estado Reportado: fail (OTA status in DB: ${update.status})`,
    );

    if (update.status === 'failed') {
      return { success: true, message: 'OTA ya estaba fallida' };
    }

    if (update.status === 'completed' || update.status === 'canceled') {
      return {
        success: true,
        message: `OTA ya estaba finalizada en estado ${update.status}`,
      };
    }

    if (!this.canTransition(update.status, 'failed')) {
      throw new ConflictException(
        `No se puede marcar como fallida porque su estado actual es '${update.status}'.`,
      );
    }

    const result = await this.updatesRepository.update(
      { id: update.id, status: update.status },
      { status: 'failed', reason: dto.reason || 'Unknown error' },
    );

    if (result.affected === 0) {
      throw new ConflictException(
        `Conflicto de concurrencia: la OTA ya no está en el estado esperado.`,
      );
    }

    return { success: true, message: 'OTA marcada como fallida' };
  }

  async cancelOta(dto: CancelOtaDto, userId: number) {
    const device = await this.devicesService.findBySerialNumber(
      dto.serial_number,
    );
    if (!device) {
      throw new NotFoundException(
        `Device with serial number ${dto.serial_number} not found`,
      );
    }

    const hasAccess = await this.devicesService.getUserDeviceLink(
      device.id,
      userId,
    );
    if (!hasAccess || !hasAccess.owner) {
      throw new UnauthorizedException(
        'No tienes permisos (debes ser el dueño) para cancelar actualizaciones para este dispositivo.',
      );
    }

    const update = await this.updatesRepository.findOne({
      where: { device_id: device.id, status: In(['pending', 'in_progress']) },
      order: { created_at: 'DESC' },
    });

    if (!update) {
      return {
        success: true,
        message: 'No hay solicitudes OTA pendientes para cancelar',
      };
    }

    if (update.status === 'in_progress') {
      throw new ConflictException(
        'No se puede cancelar una actualización que ya está en curso',
      );
    }

    if (!this.canTransition(update.status, 'canceled')) {
      throw new ConflictException(
        `No se puede cancelar una actualización en estado '${update.status}'`,
      );
    }

    const result = await this.updatesRepository.update(
      { id: update.id, status: 'pending' },
      { status: 'canceled' },
    );

    if (result.affected === 0) {
      throw new ConflictException(
        `Conflicto de concurrencia: la OTA ya no está en estado pending.`,
      );
    }

    return { success: true, message: 'Solicitud OTA cancelada correctamente' };
  }

  async getPendingOtaForDevice(
    deviceId: number,
  ): Promise<DeviceFirmwareUpdate | null> {
    const update = await this.updatesRepository.findOne({
      where: { device_id: deviceId, status: In(['pending', 'in_progress']) },
      order: { created_at: 'DESC' },
    });

    if (!update) return null;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // If it's older than 24h, expire it automatically
    if (update.created_at < oneDayAgo) {
      await this.updatesRepository.update(
        { id: update.id, status: update.status },
        { status: 'failed', reason: 'timeout_no_complete' },
      );
      return null;
    }

    // Update last_seen_at
    await this.updatesRepository.update(update.id, {
      last_seen_at: new Date(),
    });

    return update;
  }

  async getAllPendingOtas(): Promise<any[]> {
    const pendingUpdates = await this.updatesRepository.find({
      where: { status: In(['pending', 'in_progress']) },
      order: { created_at: 'DESC' },
    });

    // We need to fetch serial numbers from device IDs
    const result: any[] = [];
    for (const update of pendingUpdates) {
      const device = await this.devicesService.findOne(update.device_id);
      if (device) {
        const minutes_pending = Math.floor(
          (Date.now() - update.created_at.getTime()) / 60000,
        );
        result.push({
          request_id: update.request_id,
          serial_number: device.serial_number,
          target_version: update.target_version,
          status: update.status,
          created_at: update.created_at,
          minutes_pending,
          last_seen_at: update.last_seen_at,
        });
      }
    }
    return result;
  }

  async autoCompleteOta(id: number): Promise<void> {
    await this.updatesRepository.update(id, { status: 'completed' });
  }
}
