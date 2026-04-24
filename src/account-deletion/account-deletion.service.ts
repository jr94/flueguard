import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AccountDeletionRequest } from './entities/account-deletion-request.entity';
import { User } from '../users/entities/user.entity';
import { UserDevice } from '../devices/entities/user-device.entity';
import { Token } from '../auth/entities/token.entity';
import { DevicePushToken } from '../push-tokens/entities/device-push-token.entity';
import { PasswordReset } from '../auth/forgot-password/entities/password-reset.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @InjectRepository(AccountDeletionRequest)
    private readonly requestRepo: Repository<AccountDeletionRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async requestDeletion(email: string): Promise<void> {
    this.logger.log(`Account deletion requested for email: ${email}`);

    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      // Return successfully even if user doesn't exist for security reasons
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const ttlMinutes = this.configService.get<number>('ACCOUNT_DELETION_TOKEN_TTL_MINUTES', 30);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);

    const request = this.requestRepo.create({
      user_id: user.id,
      email: user.email,
      tokenHash,
      expiresAt,
    });

    await this.requestRepo.save(request);

    const baseUrl = this.configService.get<string>('FRONTEND_OR_PUBLIC_BASE_URL', 'https://flueguard.cl');
    const link = `${baseUrl}/delete-account/confirm?token=${rawToken}`;

    await this.mailService.sendAccountDeletionEmail(user.email, link);
    this.logger.log(`Account deletion email sent to: ${email}`);
  }

  async confirmDeletion(rawToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const request = await this.requestRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!request) {
      throw new BadRequestException('Token inválido o expirado.');
    }

    if (request.usedAt) {
      throw new BadRequestException('Este enlace ya fue utilizado.');
    }

    if (new Date() > request.expiresAt) {
      throw new BadRequestException('Este enlace ha expirado.');
    }

    const user = request.user;
    if (!user) {
      throw new BadRequestException('El usuario asociado a esta solicitud ya no existe.');
    }

    this.logger.log(`Starting account deletion for user ${user.id} (${user.email})`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. device_push_tokens WHERE user_id = user.id
      await queryRunner.manager.delete(DevicePushToken, { user_id: user.id });
      
      // 2. auth_tokens WHERE user_id = user.id
      await queryRunner.manager.delete(Token, { user_id: user.id });

      // 3. password_resets WHERE user_id = user.id OR email = user.email
      await queryRunner.manager.delete(PasswordReset, [
        { user_id: user.id },
        { email: user.email },
      ]);

      // 4. user_devices WHERE user_id = user.id
      await queryRunner.manager.delete(UserDevice, { user_id: user.id });

      // 5. users WHERE id = user.id
      await queryRunner.manager.delete(User, { id: user.id });

      request.usedAt = new Date();
      await queryRunner.manager.update(AccountDeletionRequest, request.id, { usedAt: request.usedAt });

      await queryRunner.commitTransaction();
      this.logger.log(`Account deletion completed successfully for user ${user.id}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to delete account for user ${user.id}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
