import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceShareUser } from './entities/device-share-user.entity';
import { UserDeviceNotification } from './entities/user-device-notification.entity';
import { ShareDeviceDto, UpdateDeviceShareDto } from './dto/share-device.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(DeviceShareUser)
    private readonly shareRepository: Repository<DeviceShareUser>,
    @InjectRepository(UserDeviceNotification)
    private readonly notificationRepository: Repository<UserDeviceNotification>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
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

  async findByUserId(userId: number): Promise<any[]> {
    const query = this.deviceRepository.createQueryBuilder('d')
      .leftJoin(DeviceShareUser, 'dsu', 'dsu.device_id = d.id')
      .where('d.user_id = :userId', { userId })
      .orWhere('dsu.user_id = :userId', { userId })
      .orderBy('d.id', 'DESC');

    const devices = await query.getMany();
    
    // Add access_type
    return Promise.all(devices.map(async (device) => {
      const isOwner = device.user_id === userId;
      return {
        ...device,
        access_type: isOwner ? 'owner' : 'shared',
      };
    }));
  }

  async findOneWithAccess(id: number, userId: number): Promise<any> {
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    const isOwner = device.user_id === userId;
    let permissions: any = null;

    if (!isOwner) {
      const share = await this.shareRepository.findOne({ where: { device_id: id, user_id: userId } });
      if (!share) {
        throw new NotFoundException(`Device with ID ${id} not found or access denied`);
      }
      permissions = {
        can_edit_settings: share.can_edit_settings,
        can_silence_alarm: share.can_silence_alarm,
      };
    } else {
      permissions = {
        can_edit_settings: true,
        can_silence_alarm: true,
      };
    }

    return {
      ...device,
      access_type: isOwner ? 'owner' : 'shared',
      permissions,
    };
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

  // Access check helpers
  async validateDeviceAccess(deviceId: number, currentUserId: number): Promise<boolean> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) return false;
    
    if (device.user_id === currentUserId) return true;
    
    const share = await this.shareRepository.findOne({ where: { device_id: deviceId, user_id: currentUserId } });
    return !!share;
  }

  async getDeviceAccessDetails(deviceId: number, currentUserId: number) {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    if (device.user_id === currentUserId) {
      return { isOwner: true, permissions: { can_edit_settings: true, can_silence_alarm: true } };
    }

    const share = await this.shareRepository.findOne({ where: { device_id: deviceId, user_id: currentUserId } });
    if (share) {
      return { isOwner: false, permissions: { can_edit_settings: share.can_edit_settings, can_silence_alarm: share.can_silence_alarm } };
    }

    throw new NotFoundException('Access denied');
  }

  // Sharing endpoints logic
  async shareDevice(deviceId: number, ownerId: number, dto: ShareDeviceDto) {
    const device = await this.findOne(deviceId);
    if (device.user_id !== ownerId) {
      throw new BadRequestException('Solo el owner puede compartir el dispositivo');
    }

    const targetUser = await this.usersService.findByEmail(dto.email);
    if (!targetUser) {
      throw new NotFoundException('El usuario no existe');
    }

    if (targetUser.id === ownerId) {
      throw new BadRequestException('No puedes compartir el dispositivo contigo mismo');
    }

    const existingShare = await this.shareRepository.findOne({ where: { device_id: deviceId, user_id: targetUser.id } });
    if (existingShare) {
      throw new BadRequestException('El dispositivo ya está compartido con este usuario');
    }

    const share = this.shareRepository.create({
      device_id: deviceId,
      user_id: targetUser.id,
      can_edit_settings: dto.can_edit_settings ?? false,
      can_silence_alarm: dto.can_silence_alarm ?? true,
    });
    await this.shareRepository.save(share);

    const notification = await this.notificationRepository.findOne({ where: { device_id: deviceId, user_id: targetUser.id } });
    if (!notification) {
      await this.notificationRepository.save(this.notificationRepository.create({
        device_id: deviceId,
        user_id: targetUser.id,
        notifications_enabled: true,
      }));
    }

    return { success: true, message: 'Dispositivo compartido correctamente' };
  }

  async getDeviceUsers(deviceId: number, currentUserId: number) {
    const hasAccess = await this.validateDeviceAccess(deviceId, currentUserId);
    if (!hasAccess) {
      throw new NotFoundException('Acceso denegado');
    }

    const device = await this.findOne(deviceId);
    const ownerInfo = await this.usersService.findOne(device.user_id);
    
    const shares = await this.shareRepository.find({
      where: { device_id: deviceId },
      relations: ['user'],
    });

    return {
      device_id: deviceId,
      owner: {
        id: ownerInfo.id,
        email: ownerInfo.email,
        first_name: ownerInfo.first_name,
        last_name: ownerInfo.last_name,
        role: 'owner',
      },
      shared_users: shares.map(share => ({
        id: share.user.id,
        email: share.user.email,
        first_name: share.user.first_name,
        last_name: share.user.last_name,
        role: 'shared',
        can_edit_settings: share.can_edit_settings,
        can_silence_alarm: share.can_silence_alarm,
      })),
    };
  }

  async removeSharedUser(deviceId: number, ownerId: number, userIdToRemove: number) {
    const device = await this.findOne(deviceId);
    if (device.user_id !== ownerId) {
      throw new BadRequestException('Solo el owner puede quitar acceso');
    }

    if (ownerId === userIdToRemove) {
      throw new BadRequestException('No puedes quitar el acceso al owner');
    }

    await this.shareRepository.delete({ device_id: deviceId, user_id: userIdToRemove });
    await this.notificationRepository.delete({ device_id: deviceId, user_id: userIdToRemove });
    
    return { success: true, message: 'Acceso eliminado correctamente' };
  }

  async updateSharedUserPermissions(deviceId: number, ownerId: number, userIdToUpdate: number, dto: UpdateDeviceShareDto) {
    const device = await this.findOne(deviceId);
    if (device.user_id !== ownerId) {
      throw new BadRequestException('Solo el owner puede modificar permisos');
    }

    if (ownerId === userIdToUpdate) {
      throw new BadRequestException('No puedes modificar permisos del owner');
    }

    const share = await this.shareRepository.findOne({ where: { device_id: deviceId, user_id: userIdToUpdate } });
    if (!share) {
      throw new NotFoundException('El usuario no  tiene acceso compartido');
    }

    if (dto.can_edit_settings !== undefined) share.can_edit_settings = dto.can_edit_settings;
    if (dto.can_silence_alarm !== undefined) share.can_silence_alarm = dto.can_silence_alarm;

    await this.shareRepository.save(share);

    return { success: true, message: 'Permisos actualizados correctamente' };
  }
}
