import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  async create(createDeviceDto: CreateDeviceDto): Promise<Device> {
    const { serial_number, user_id, device_name } = createDeviceDto;
    
    const existingDevice = await this.deviceRepository.findOne({ where: { serial_number } });
    if (existingDevice) {
      existingDevice.user_id = user_id;
      existingDevice.device_name = device_name;
      return this.deviceRepository.save(existingDevice);
    }

    const device = this.deviceRepository.create({
      ...createDeviceDto,
      status: 'offline',
    });

    return this.deviceRepository.save(device);
  }

  async findByUserId(userId: number): Promise<Device[]> {
    return this.deviceRepository.find({ where: { user_id: userId } });
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
