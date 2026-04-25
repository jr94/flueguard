import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicePushToken } from './entities/device-push-token.entity';
import { CreatePushTokenDto } from './dto/create-push-token.dto';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class PushTokensService {
  constructor(
    @InjectRepository(DevicePushToken)
    private readonly pushTokenRepository: Repository<DevicePushToken>,
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
  ) {}

  async registerToken(createDto: CreatePushTokenDto) {
    const { user_id, device_id, platform } = createDto;
    const fcm_token = createDto.fcm_token.trim();

    if (!fcm_token) {
      throw new BadRequestException('El token FCM no puede estar vacío');
    }

    // 1. Validar existencia de user_id y device_id
    // throws NotFoundException internally if not found -> 404 error perfectly prevents 500
    await this.usersService.findOne(user_id);
    await this.devicesService.findOne(device_id);

    const plat = platform || 'android';

    try {
      // 2. Desactivar tokens antiguos del mismo usuario, dispositivo y plataforma
      await this.pushTokenRepository.query(
        `UPDATE device_push_tokens 
         SET is_active = 0 
         WHERE user_id = ? AND device_id = ? AND platform = ? AND fcm_token != ?`,
        [user_id, device_id, plat, fcm_token],
      );

      // 3. Insert o Update según solicitado
      await this.pushTokenRepository.query(
        `INSERT INTO device_push_tokens (user_id, device_id, fcm_token, platform)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            device_id = VALUES(device_id),
            platform = VALUES(platform),
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP`,
        [user_id, device_id, fcm_token, plat],
      );

      return {
        success: true,
        message: 'Token registrado correctamente',
      };
    } catch (error) {
      console.error('Error procesando FCM token:', error);
      throw new InternalServerErrorException('Error interno al guardar en base de datos');
    }
  }
}
