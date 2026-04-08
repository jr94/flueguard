import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { UserDevice } from './entities/user-device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,
  ) {}

  async create(createDeviceDto: CreateDeviceDto): Promise<Device> {
    const { serial_number, user_id, device_name } = createDeviceDto;
    
    let device = await this.deviceRepository.findOne({ where: { serial_number } });
    if (device) {
      device.device_name = device_name;
      device = await this.deviceRepository.save(device);
    } else {
      device = this.deviceRepository.create({
        serial_number,
        device_name,
        status: 'offline',
      });
      device = await this.deviceRepository.save(device);
    }

    const existingLink = await this.userDeviceRepository.findOne({
      where: { user_id, device_id: device.id }
    });

    if (!existingLink) {
      const link = this.userDeviceRepository.create({
        user_id,
        device_id: device.id,
      });
      await this.userDeviceRepository.save(link);
    }

    return device;
  }

  async findByUserId(userId: number): Promise<Device[]> {
    return this.deviceRepository
      .createQueryBuilder('device')
      .innerJoin('user_devices', 'ud', 'ud.device_id = device.id')
      .where('ud.user_id = :userId', { userId })
      .getMany();
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
}
