import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Device } from './entities/device.entity';
import { UserDevice } from './entities/user-device.entity';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { ShareDeviceDto } from './dto/share-device.dto';
import { UpdateShareDeviceDto } from './dto/update-share-device.dto';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { calculateDeviceOperationalStatus } from '../telemetry/device-status.utils';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { performance } from 'perf_hooks';
import {
  DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
  MAINTENANCE_PREVENTIVE_HOURS,
  MAINTENANCE_URGENT_HOURS,
} from '../maintenance/constants/maintenance.constants';
import { DeviceMaintenance } from '../maintenance/entities/device-maintenance.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,
    @InjectRepository(DeviceSetting)
    private readonly deviceSettingRepository: Repository<DeviceSetting>,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(createDeviceDto: CreateDeviceDto): Promise<Device> {
    const { serial_number, user_id, device_name, FW_VERSION, model } = createDeviceDto;

    return await this.dataSource.transaction(async (manager) => {
      // 1. Buscar o crear el dispositivo
      let device = await manager.findOne(Device, { where: { serial_number } });

      if (device) {
        device.device_name = device_name;
        if (FW_VERSION) {
          device.firmware_version = FW_VERSION;
        }
        if (model) {
          device.model = model;
        }
        device = await manager.save(Device, device);
      } else {
        device = manager.create(Device, {
          serial_number,
          device_name,
          status: 'offline',
          firmware_version: FW_VERSION,
          model: model || null,
        });
        device = await manager.save(Device, device);
        console.log(
          `[DevicesService] Device created id=${device.id} serial=${device.serial_number}`,
        );
      }

      // 2. Vincular con el usuario
      const existingLink = await manager.findOne(UserDevice, {
        where: { user_id, device_id: device.id },
      });

      if (!existingLink) {
        const link = manager.create(UserDevice, {
          user_id,
          device_id: device.id,
          owner: true,
          edit: true,
        });
        await manager.save(UserDevice, link);
      }

      // 3. Crear settings por defecto si no existen
      const existingSettings = await manager.findOne(DeviceSetting, {
        where: { device_id: device.id },
      });

      if (!existingSettings) {
        const defaultSettings = manager.create(DeviceSetting, {
          device_id: device.id,
          type_device: 0,
          threshold_1: 90.0,
          threshold_2: 230.0,
          threshold_3: 350.0,
          notifications_enabled: true,
          sound_alarm_enabled: true,
          sound_alarm_temp_low: false, // Mapea a la columna alarm_low_temp
          timezone: 'America/Santiago',
        });
        await manager.save(DeviceSetting, defaultSettings);
        console.log(
          `[DevicesService] Default settings created for device id=${device.id}`,
        );
      }

      return device;
    });
  }

  async findByUserId(userId: number): Promise<any[]> {
    const devices = await this.deviceRepository
      .createQueryBuilder('device')
      .innerJoin('user_devices', 'ud', 'ud.device_id = device.id')
      .where('ud.user_id = :userId', { userId })
      .orderBy('device.id', 'ASC')
      .getMany();

    const deviceIds = devices.map((d) => d.id);
    let lastLogs: TemperatureLog[] = [];
    if (deviceIds.length > 0) {
      lastLogs = await this.dataSource
        .getRepository(TemperatureLog)
        .createQueryBuilder('log')
        .innerJoin(
          (qb) =>
            qb
              .select('sub.device_id', 'device_id')
              .addSelect('MAX(sub.id)', 'max_id')
              .from(TemperatureLog, 'sub')
              .where('sub.device_id IN (:...deviceIds)', { deviceIds })
              .groupBy('sub.device_id'),
          'grouped',
          'log.id = grouped.max_id',
        )
        .getMany();
    }

    const logsMap = new Map<number, TemperatureLog>();
    for (const log of lastLogs) {
      logsMap.set(log.device_id, log);
    }

    const results: any[] = [];
    const now = new Date();

    for (const device of devices) {
      const lastLog = logsMap.get(device.id) || null;
      const lastTemp = lastLog ? Number(lastLog.temperature) : null;
      const lastLogAt = lastLog ? lastLog.created_at : null;

      const connection_state = calculateDeviceOperationalStatus({
        lastTemperature: lastTemp,
        lastLogAt,
        now,
      });

      let minutes_since_last_log: number | null = null;
      if (lastLogAt) {
        const diffMs = now.getTime() - new Date(lastLogAt).getTime();
        minutes_since_last_log = Math.max(0, Math.floor(diffMs / (60 * 1000)));
      }

      results.push({
        ...device,
        user_id: userId,
        connection_state,
        minutes_since_last_log,
        last_temperature: lastTemp,
        last_log_time: lastLogAt,
      });
    }

    return results;
  }

  async enrichDeviceWithStatus(device: Device): Promise<any> {
    const lastLog = await this.dataSource
      .getRepository(TemperatureLog)
      .findOne({
        where: { device_id: device.id },
        order: { created_at: 'DESC' },
      });

    const lastTemp = lastLog ? Number(lastLog.temperature) : null;
    const lastLogAt = lastLog ? lastLog.created_at : null;
    const now = new Date();

    const connection_state = calculateDeviceOperationalStatus({
      lastTemperature: lastTemp,
      lastLogAt,
      now,
    });

    let minutes_since_last_log: number | null = null;
    if (lastLogAt) {
      const diffMs = now.getTime() - new Date(lastLogAt).getTime();
      minutes_since_last_log = Math.max(0, Math.floor(diffMs / (60 * 1000)));
    }

    return {
      ...device,
      connection_state,
      minutes_since_last_log,
      last_temperature: lastTemp,
      last_log_time: lastLogAt,
    };
  }

  async findAll(): Promise<Device[]> {
    return this.deviceRepository.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<Device> {
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }
    return device;
  }

  async findBySerialNumber(serial_number: string): Promise<Device | null> {
    return this.deviceRepository.findOne({ where: { serial_number } });
  }

  async updateLastConnection(id: number): Promise<void> {
    await this.deviceRepository.update(id, {
      status: 'online',
      last_connection: new Date(),
    });
  }

  async updateFirmwareVersion(id: number, version: string): Promise<void> {
    await this.deviceRepository.update(id, {
      firmware_version: version,
    });
  }

  async updateDeviceName(id: number, device_name: string): Promise<void> {
    await this.deviceRepository.update(id, {
      device_name,
    });
  }

  async updateDevicePartial(
    id: number,
    payload: Partial<Device>,
  ): Promise<void> {
    if (Object.keys(payload).length > 0) {
      payload.updated_at = new Date();
      await this.deviceRepository.update(id, payload);
    }
  }

  async shareDevice(
    shareDeviceDto: ShareDeviceDto,
  ): Promise<{ success: boolean; message: string }> {
    const { device_id, email } = shareDeviceDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }

    // Verify the device exists too
    await this.findOne(device_id);

    const existingLink = await this.userDeviceRepository.findOne({
      where: { user_id: user.id, device_id },
    });

    if (existingLink) {
      throw new ConflictException(
        'El usuario ya tiene acceso a este dispositivo',
      );
    }

    const newLink = this.userDeviceRepository.create({
      user_id: user.id,
      device_id,
      owner: false,
      edit: false,
    });
    await this.userDeviceRepository.save(newLink);

    return { success: true, message: 'Dispositivo compartido exitosamente' };
  }

  async unshareDevice(
    shareDeviceDto: ShareDeviceDto,
  ): Promise<{ success: boolean; message: string }> {
    const { device_id, email } = shareDeviceDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }

    const existingLink = await this.userDeviceRepository.findOne({
      where: { user_id: user.id, device_id },
    });

    if (!existingLink) {
      throw new NotFoundException(
        'El usuario no tiene acceso a este dispositivo',
      );
    }

    await this.userDeviceRepository.delete(existingLink.id);

    return { success: true, message: 'Acceso removido exitosamente' };
  }

  async getSharedUsers(
    deviceId: number,
    requestUserId: number,
  ): Promise<any[]> {
    // Check if the requesting user has access to this device
    const hasAccess = await this.userDeviceRepository.findOne({
      where: { user_id: requestUserId, device_id: deviceId },
    });

    if (!hasAccess) {
      throw new UnauthorizedException(
        'No tienes permisos temporales o dueñez para ver la configuración de este equipo.',
      );
    }

    // Retrieve users linked to this device (excluding the original owner)
    const userDevices = await this.userDeviceRepository.find({
      where: { device_id: deviceId, owner: false },
      relations: ['user'],
    });

    return userDevices.map((ud) => ({
      id: ud.user.id,
      first_name: ud.user.first_name,
      last_name: ud.user.last_name,
      email: ud.user.email,
      owner: ud.owner ? 1 : 0,
      edit: ud.edit ? 1 : 0,
    }));
  }

  async updateSharePermission(
    dto: UpdateShareDeviceDto,
  ): Promise<{ success: boolean; message: string }> {
    const { device_id, user_id, edit } = dto;

    const existingLink = await this.userDeviceRepository.findOne({
      where: { user_id, device_id },
    });

    if (!existingLink) {
      throw new NotFoundException(
        'El usuario no se encuentra asociado a este dispositivo',
      );
    }

    if (existingLink.owner) {
      throw new ConflictException(
        'No se pueden remover los permisos de edición al administrador (owner)',
      );
    }

    existingLink.edit = edit;
    await this.userDeviceRepository.save(existingLink);

    return {
      success: true,
      message: 'Permisos de edición asignados correctamente',
    };
  }

  async getUserDeviceLink(
    deviceId: number,
    userId: number,
  ): Promise<UserDevice | null> {
    return this.userDeviceRepository.findOne({
      where: { device_id: deviceId, user_id: userId },
    });
  }

  async removeBySerial(
    serial_number: string,
    userId: number,
  ): Promise<{
    success: boolean;
    message: string;
    mode: string;
    serial_number: string;
  }> {
    if (!serial_number) {
      // Since validation handles body DTO, this is extra safety or if called internally
      throw new ConflictException('serial_number is required');
    }

    const device = await this.deviceRepository.findOne({
      where: { serial_number },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const userDevice = await this.userDeviceRepository.findOne({
      where: { user_id: userId, device_id: device.id },
    });

    if (!userDevice) {
      throw new ForbiddenException(
        'You do not have permission to remove this device',
      );
    }

    if (userDevice.owner) {
      // User is the owner, perform full cascading delete
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.delete('device_settings', {
          device_id: device.id,
        });
        await queryRunner.manager.delete('device_firmware_updates', {
          device_id: device.id,
        });
        await queryRunner.manager.delete('temperature_logs', {
          device_id: device.id,
        });
        await queryRunner.manager.delete('user_devices', {
          device_id: device.id,
        });
        await queryRunner.manager.delete('devices', { id: device.id });

        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Dispositivo eliminado completamente',
          mode: 'owner_full_delete',
          serial_number,
        };
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } else {
      // User is not the owner, just detach
      await this.userDeviceRepository.delete({
        user_id: userId,
        device_id: device.id,
      });

      return {
        success: true,
        message: 'Dispositivo eliminado de tu cuenta',
        mode: 'shared_user_detach',
        serial_number,
      };
    }
  }

  async updateNotifications(
    deviceId: number,
    userId: number,
    enabled: boolean,
  ): Promise<{
    device_id: number;
    user_id: number;
    notifications_enabled: boolean;
  }> {
    const userDevice = await this.userDeviceRepository.findOne({
      where: { user_id: userId, device_id: deviceId },
    });

    if (!userDevice) {
      throw new NotFoundException('Relación user_devices no encontrada');
    }

    userDevice.notifications_enabled = enabled;
    await this.userDeviceRepository.save(userDevice);

    return {
      device_id: deviceId,
      user_id: userId,
      notifications_enabled: enabled,
    };
  }

  async getNotificationsStatus(
    deviceId: number,
    userId: number,
  ): Promise<{
    device_id: number;
    user_id: number;
    notifications_enabled: boolean;
  }> {
    const userDevice = await this.userDeviceRepository.findOne({
      where: { user_id: userId, device_id: deviceId },
    });

    if (!userDevice) {
      throw new NotFoundException('Relación user_devices no encontrada');
    }

    return {
      device_id: deviceId,
      user_id: userId,
      notifications_enabled: userDevice.notifications_enabled,
    };
  }

  async getDeviceDetail(id: number, userId: number): Promise<any> {
    const startTime = performance.now();

    // 1. Validar existencia del dispositivo
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    // 2. Validar acceso del usuario
    const userDeviceLink = await this.userDeviceRepository.findOne({
      where: { user_id: userId, device_id: id },
    });
    if (!userDeviceLink) {
      throw new ForbiddenException('No tienes acceso a este dispositivo');
    }

    // 3. Obtener logs (last_log y recent_logs)
    const tempLogRepo = this.dataSource.getRepository(TemperatureLog);
    
    const lastLog = await tempLogRepo.findOne({
      where: { device_id: id },
      order: { id: 'DESC' },
    });

    const recentLogsDesc = await tempLogRepo.find({
      where: { device_id: id },
      order: { id: 'DESC' },
      take: 10,
    });
    const recent_logs = [...recentLogsDesc].reverse();

    // 4. Calcular connection_state y minutes_since_last_log
    const lastTemp = lastLog ? Number(lastLog.temperature) : null;
    const lastLogAt = lastLog ? lastLog.created_at : null;
    const now = new Date();

    const connection_state = calculateDeviceOperationalStatus({
      lastTemperature: lastTemp,
      lastLogAt,
      now,
    });

    let minutes_since_last_log: number | null = null;
    if (lastLogAt) {
      const diffMs = now.getTime() - new Date(lastLogAt).getTime();
      minutes_since_last_log = Math.max(0, Math.floor(diffMs / (60 * 1000)));
    }

    const deviceData = {
      id: device.id,
      serial_number: device.serial_number,
      model: device.model,
      device_name: device.device_name,
      status: device.status,
      firmware_version: device.firmware_version,
      last_connection: device.last_connection,
      ip_address: device.ip_address,
      region_id: device.region_id,
      comuna_id: device.comuna_id,
      direccion: device.direccion,
      created_at: device.created_at,
      updated_at: device.updated_at,
      connection_state,
      minutes_since_last_log,
    };

    // 5. Ajustes del dispositivo
    const settingsEntity = await this.deviceSettingRepository.findOne({
      where: { device_id: id },
    });

    // 6. Suscripción y feature flags
    const planFeatures = await this.subscriptionsService.getUserPlanFeatures(userId);
    const activeSub = await this.subscriptionsService.getActiveSubscriptionByUserId(userId);
    
    const planCode = planFeatures.plan_code || 'basic';
    const planName = planFeatures.plan_name || 'FlueGuard Básico';
    const subStatus = activeSub ? activeSub.status : 'inactive';

    const subscription = {
      plan_name: planName,
      plan_code: planCode,
      status: subStatus,
    };

    const settings = settingsEntity
      ? {
          id: settingsEntity.id,
          device_id: settingsEntity.device_id,
          type_device: settingsEntity.type_device,
          threshold_1: settingsEntity.threshold_1 !== null ? Number(settingsEntity.threshold_1) : null,
          threshold_2: settingsEntity.threshold_2 !== null ? Number(settingsEntity.threshold_2) : null,
          threshold_3: settingsEntity.threshold_3 !== null ? Number(settingsEntity.threshold_3) : null,
          notifications_enabled: settingsEntity.notifications_enabled,
          sound_alarm_enabled: settingsEntity.sound_alarm_enabled,
          sound_alarm_temp_low: settingsEntity.sound_alarm_temp_low,
          timezone: settingsEntity.timezone,
          created_at: settingsEntity.created_at,
          updated_at: settingsEntity.updated_at,
          owner: userDeviceLink.owner ? 1 : 0,
          edit: userDeviceLink.edit ? 1 : 0,
          region_id: device.region_id,
          comuna_id: device.comuna_id,
          direccion: device.direccion,
          plan_name: planCode,
        }
      : null;

    const feature_flags = {
      show_metrics_analysis: planCode === 'pro',
      show_maintenance: planCode === 'plus' || planCode === 'pro',
      can_use_low_temperature_reminder: planCode === 'plus' || planCode === 'pro',
      can_use_prediction_curve: planCode === 'plus' || planCode === 'pro',
      allowed_history_views: planCode === 'pro'
        ? ['hour', 'day', 'week', 'month']
        : planCode === 'plus'
        ? ['hour', 'day', 'week']
        : ['hour'],
    };

    // 7. Mantención (si aplica)
    let maintenance = null;
    if (planCode === 'plus' || planCode === 'pro') {
      try {
        const maintenanceRepo = this.dataSource.getRepository(DeviceMaintenance);
        let mEntity = await maintenanceRepo.findOne({
          where: { device_id: id },
        });

        if (!mEntity) {
          mEntity = maintenanceRepo.create({
            device_id: id,
            threshold_hours: DEFAULT_MAINTENANCE_THRESHOLD_HOURS,
            usage_seconds_accumulated: 0,
          });
          mEntity = await maintenanceRepo.save(mEntity);
        }

        const usageHours = Number(
          (mEntity.usage_seconds_accumulated / 3600).toFixed(2),
        );
        const percentage = Math.min(
          100,
          Math.round(
            (mEntity.usage_seconds_accumulated /
              (mEntity.threshold_hours * 3600)) *
              100,
          ),
        );

        let maintenanceStatus = 'ok';
        if (usageHours >= MAINTENANCE_URGENT_HOURS) {
          maintenanceStatus = 'urgent';
        } else if (usageHours >= MAINTENANCE_PREVENTIVE_HOURS) {
          maintenanceStatus = 'preventive';
        }

        maintenance = {
          device_id: mEntity.device_id,
          usage_seconds_accumulated: mEntity.usage_seconds_accumulated,
          usage_hours: usageHours,
          threshold_hours: mEntity.threshold_hours,
          preventive_threshold_hours: MAINTENANCE_PREVENTIVE_HOURS,
          urgent_threshold_hours: MAINTENANCE_URGENT_HOURS,
          percentage: percentage,
          maintenance_status: maintenanceStatus,
          requires_maintenance: percentage >= 100,
          requires_preventive_maintenance:
            usageHours >= MAINTENANCE_PREVENTIVE_HOURS,
          requires_urgent_maintenance: usageHours >= MAINTENANCE_URGENT_HOURS,
          last_notified_at: mEntity.last_notified_at,
          last_preventive_notified_at: mEntity.last_preventive_notified_at,
          last_urgent_notified_at: mEntity.last_urgent_notified_at,
          last_reset_at: mEntity.last_reset_at,
        };
      } catch (e) {
        console.error(`[DevicesService] Error calculating maintenance for device ${id}:`, e);
      }
    }

    // 8. Permisos
    const permissions = {
      owner: userDeviceLink.owner ? 1 : 0,
      edit: userDeviceLink.edit ? 1 : 0,
      notifications_enabled: userDeviceLink.notifications_enabled ? 1 : 0,
    };

    const duration = performance.now() - startTime;
    console.log(`[PERFORMANCE] getDeviceDetail for device ID ${id} took ${duration.toFixed(2)}ms`);

    return {
      device: deviceData,
      settings,
      last_log: lastLog
        ? {
            id: lastLog.id,
            device_id: lastLog.device_id,
            temperature: Number(lastLog.temperature),
            created_at: lastLog.created_at,
          }
        : null,
      recent_logs: recent_logs.map((log) => ({
        id: log.id,
        device_id: log.device_id,
        temperature: Number(log.temperature),
        created_at: log.created_at,
      })),
      subscription,
      feature_flags,
      maintenance,
      permissions,
    };
  }
}
