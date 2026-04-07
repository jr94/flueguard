import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSetting } from './entities/device-setting.entity';
import { UpdateDeviceSettingDto } from './dto/update-device-setting.dto';
import { DevicesService } from '../devices/devices.service';
import { UserDeviceNotification } from '../devices/entities/user-device-notification.entity';

@Injectable()
export class DeviceSettingsService {
  constructor(
    @InjectRepository(DeviceSetting)
    private readonly deviceSettingRepository: Repository<DeviceSetting>,
    @InjectRepository(UserDeviceNotification)
    private readonly notificationRepository: Repository<UserDeviceNotification>,
    private readonly devicesService: DevicesService,
  ) {}

  async findByDeviceId(deviceId: number, userId?: number): Promise<any> {
    if (userId) {
      const hasAccess = await this.devicesService.validateDeviceAccess(deviceId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('No tienes acceso a este dispositivo');
      }
    }

    let setting = await this.deviceSettingRepository.findOne({ where: { device_id: deviceId } });
    if (!setting) {
      // Return default values if not created
      setting = {
        device_id: deviceId,
        type_device: 0,
        threshold_1: null,
        threshold_2: null,
        threshold_3: null,
        sound_alarm_enabled: true,
        sound_alarm_temp_low: true,
      } as any;
    }

    let notifications_enabled = true;
    if (userId) {
      const notification = await this.notificationRepository.findOne({ where: { device_id: deviceId, user_id: userId } });
      notifications_enabled = notification ? notification.notifications_enabled : true;
    }

    return {
      ...setting,
      ...(userId ? { notifications_enabled } : {}),
    };
  }

  async findBySerialNumber(serialNumber: string, userId?: number): Promise<any> {
    const device = await this.devicesService.findBySerialNumber(serialNumber);
    if (!device) {
      throw new NotFoundException(`Device with serial number ${serialNumber} not found`);
    }

    if (userId) {
       return this.findByDeviceId(device.id, userId);
    }
    
    // For local device / endpoints without user
    const setting = await this.deviceSettingRepository.findOne({ where: { device_id: device.id } });
    return setting;
  }

  async update(deviceId: number, userId: number, updateDto: any): Promise<any> {
    const access = await this.devicesService.getDeviceAccessDetails(deviceId, userId);
    
    const { notifications_enabled, ...globalSettings } = updateDto;

    // Handle notifications update
    if (notifications_enabled !== undefined) {
      let notif = await this.notificationRepository.findOne({ where: { device_id: deviceId, user_id: userId } });
      if (notif) {
        notif.notifications_enabled = notifications_enabled;
        await this.notificationRepository.save(notif);
      } else {
        await this.notificationRepository.save(this.notificationRepository.create({
          device_id: deviceId,
          user_id: userId,
          notifications_enabled,
        }));
      }
    }

    // Process global settings update if any
    if (Object.keys(globalSettings).length > 0) {
      if (!access.permissions.can_edit_settings) {
         throw new ForbiddenException('No tienes permisos para modificar los settings de este dispositivo');
      }

      let setting = await this.deviceSettingRepository.findOne({ where: { device_id: deviceId } });
      if (setting) {
        Object.assign(setting, globalSettings);
        await this.deviceSettingRepository.save(setting);
      } else {
        const newSetting = this.deviceSettingRepository.create({
          device_id: deviceId,
          ...globalSettings,
        });
        await this.deviceSettingRepository.save(newSetting);
      }
    }

    return this.findByDeviceId(deviceId, userId);
  }
}
