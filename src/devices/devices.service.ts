import { Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { UserDevice } from './entities/user-device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { ShareDeviceDto } from './dto/share-device.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,
    private readonly usersService: UsersService,
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
        owner: true,
        edit: true,
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

  async shareDevice(shareDeviceDto: ShareDeviceDto): Promise<{ success: boolean; message: string }> {
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
      throw new ConflictException('El usuario ya tiene acceso a este dispositivo');
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

  async unshareDevice(shareDeviceDto: ShareDeviceDto): Promise<{ success: boolean; message: string }> {
    const { device_id, email } = shareDeviceDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }

    const existingLink = await this.userDeviceRepository.findOne({
      where: { user_id: user.id, device_id },
    });

    if (!existingLink) {
      throw new NotFoundException('El usuario no tiene acceso a este dispositivo');
    }

    await this.userDeviceRepository.delete(existingLink.id);

    return { success: true, message: 'Acceso removido exitosamente' };
  }

  async getSharedUsers(deviceId: number, requestUserId: number): Promise<any[]> {
    // Check if the requesting user has access to this device
    const hasAccess = await this.userDeviceRepository.findOne({
      where: { user_id: requestUserId, device_id: deviceId }
    });

    if (!hasAccess) {
      throw new UnauthorizedException('No tienes permisos temporales o dueñez para ver la configuración de este equipo.');
    }

    // Retrieve users linked to this device
    const userDevices = await this.userDeviceRepository.find({
      where: { device_id: deviceId },
      relations: ['user']
    });

    return userDevices.map(ud => ({
      id: ud.user.id,
      first_name: ud.user.first_name,
      last_name: ud.user.last_name,
      email: ud.user.email
    }));
  }

  async getUserDeviceLink(deviceId: number, userId: number): Promise<UserDevice | null> {
    return this.userDeviceRepository.findOne({
      where: { device_id: deviceId, user_id: userId }
    });
  }
}
