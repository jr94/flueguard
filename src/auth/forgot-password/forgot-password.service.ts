import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PasswordReset } from './entities/password-reset.entity';
import { User } from '../../users/entities/user.entity';
import { MailService } from '../../mail/mail.service';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class ForgotPasswordService {
  constructor(
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) { }

  async requestPasswordReset(dto: ForgotPasswordRequestDto): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    const genericResponse = { success: true, message: 'Si el correo existe, se envió un código de recuperación.' };

    if (!user) {
      return genericResponse;
    }

    // Delete existing resets for user to prevent clutter
    await this.passwordResetRepository.delete({ user_id: user.id });

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const minutes = Number(this.configService.get<number>('FORGOT_PASSWORD_CODE_EXP_MINUTES') || 10);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);

    const resetRecord = this.passwordResetRepository.create({
      user_id: user.id,
      email: user.email,
      code,
      code_expires_at: expiresAt,
    });

    await this.passwordResetRepository.save(resetRecord);

    await this.mailService.sendForgotPasswordCode(user.email, code);

    return genericResponse;
  }

  async verifyCode(dto: VerifyCodeDto): Promise<{ success: boolean; reset_token: string }> {
    const { email, code } = dto;

    const resetRecord = await this.passwordResetRepository.findOne({
      where: { email },
      order: { created_at: 'DESC' },
    });

    if (!resetRecord || resetRecord.code !== code || new Date() > new Date(resetRecord.code_expires_at)) {
      throw new BadRequestException('Código inválido o expirado.');
    }

    const tokenLength = Number(this.configService.get<number>('FRONTEND_RESET_TOKEN_LENGTH') || 64);
    const reset_token = crypto.randomBytes(tokenLength / 2).toString('hex');

    const minutes = Number(this.configService.get<number>('FORGOT_PASSWORD_TOKEN_EXP_MINUTES') || 15);
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + minutes);

    resetRecord.verified = 1;
    resetRecord.reset_token = reset_token;
    resetRecord.token_expires_at = tokenExpiresAt;

    await this.passwordResetRepository.save(resetRecord);

    return { success: true, reset_token };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean; message: string }> {
    const { reset_token, password, confirm_password } = dto;

    if (password !== confirm_password) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }

    const resetRecord = await this.passwordResetRepository.findOne({
      where: { reset_token },
    });

    if (!resetRecord || !resetRecord.verified) {
      throw new BadRequestException('Token inválido o no verificado.');
    }

    if (resetRecord.token_expires_at && new Date() > new Date(resetRecord.token_expires_at)) {
      throw new BadRequestException('El token ha expirado.');
    }

    const user = await this.userRepository.findOne({ where: { id: resetRecord.user_id } });
    if (!user) {
      throw new BadRequestException('Usuario no válido.');
    }

    const saltRounds = 10;
    user.password_hash = await bcrypt.hash(password, saltRounds);

    await this.userRepository.save(user);

    await this.passwordResetRepository.delete({ id: resetRecord.id });

    return { success: true, message: 'Contraseña actualizada correctamente.' };
  }
}
