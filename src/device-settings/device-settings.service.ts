import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSetting } from './entities/device-setting.entity';
import { UpdateDeviceSettingDto } from './dto/update-device-setting.dto';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class DeviceSettingsService {
  constructor(
    @InjectRepository(DeviceSetting)
    private readonly deviceSettingRepository: Repository<DeviceSetting>,
    private readonly devicesService: DevicesService,
  ) {}

  async findByDeviceId(deviceId: number): Promise<DeviceSetting> {
    const setting = await this.deviceSettingRepository.findOne({ where: { device_id: deviceId } });
    if (!setting) {
      throw new NotFoundException(`Settings for device ID ${deviceId} not found`);
    }
    return setting;
  }

  async findBySerialNumber(serialNumber: string): Promise<DeviceSetting> {
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

    return setting;
  }

  async update(deviceId: number, updateDto: UpdateDeviceSettingDto): Promise<DeviceSetting> {
    let setting = await this.deviceSettingRepository.findOne({ where: { device_id: deviceId } });

    if (setting) {
      // 2. Si existe: actualizar los campos
      Object.assign(setting, updateDto);
      return this.deviceSettingRepository.save(setting);
    } else {
      // 3. Si NO existe: crear un nuevo registro
      // Este método lanzará NotFoundException automáticamente si no existe el dispositivo
      const device = await this.devicesService.findOne(deviceId);

      setting = this.deviceSettingRepository.create({
        device_id: deviceId,
        ...updateDto,
      });

      // 4. Guardar usando TypeORM repository.save()
      return this.deviceSettingRepository.save(setting);
    }
  }
}
