import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ForgotPasswordService.name);

  constructor(
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async requestPasswordReset(
    dto: ForgotPasswordRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Solicitud de recuperación de contraseña recibida para: ${dto.email}`);

    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    const genericResponse = {
      success: true,
      message: 'Si el correo está registrado, recibirás las instrucciones para recuperar tu contraseña.',
    };

    if (!user) {
      this.logger.log(`Usuario NO encontrado para el correo: ${dto.email}`);
      return genericResponse;
    }

    this.logger.log(`Usuario encontrado para el correo: ${dto.email}. ID de usuario: ${user.id}`);

    // Delete existing resets for user to prevent clutter
    await this.passwordResetRepository.delete({ user_id: user.id });

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.logger.log(`Código de recuperación de 6 dígitos generado para: ${dto.email}`);

    const minutes = Number(
      this.configService.get<number>('FORGOT_PASSWORD_CODE_EXP_MINUTES') || 10,
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);

    const resetRecord = this.passwordResetRepository.create({
      user_id: user.id,
      email: user.email,
      code,
      code_expires_at: expiresAt,
    });

    await this.passwordResetRepository.save(resetRecord);
    this.logger.log(`Registro de recuperación de contraseña guardado en base de datos.`);

    try {
      await this.mailService.sendForgotPasswordCode(user.email, code);
    } catch (error) {
      this.logger.error(`No se pudo enviar el correo de recuperación a ${user.email} debido a un error en el servicio de correo.`);
    }

    return genericResponse;
  }

  async verifyCode(
    dto: VerifyCodeDto,
  ): Promise<{ success: boolean; reset_token: string }> {
    const { email, code } = dto;
    this.logger.log(`Verificando código de recuperación para el correo: ${email}`);

    const resetRecord = await this.passwordResetRepository.findOne({
      where: { email },
      order: { created_at: 'DESC' },
    });

    if (
      !resetRecord ||
      resetRecord.code !== code ||
      new Date() > new Date(resetRecord.code_expires_at)
    ) {
      this.logger.warn(`Código de recuperación inválido o expirado para: ${email}`);
      throw new BadRequestException('Código inválido o expirado.');
    }

    this.logger.log(`Código verificado con éxito para: ${email}`);

    const tokenLength = Number(
      this.configService.get<number>('FRONTEND_RESET_TOKEN_LENGTH') || 64,
    );
    const reset_token = crypto.randomBytes(tokenLength / 2).toString('hex');
    this.logger.log(`Generando token de recuperación de contraseña.`);

    const minutes = Number(
      this.configService.get<number>('FORGOT_PASSWORD_TOKEN_EXP_MINUTES') || 15,
    );
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + minutes);

    resetRecord.verified = 1;
    resetRecord.reset_token = reset_token;
    resetRecord.token_expires_at = tokenExpiresAt;

    await this.passwordResetRepository.save(resetRecord);
    this.logger.log(`Token de recuperación guardado con éxito. Respondiendo al cliente.`);

    return { success: true, reset_token };
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const { reset_token, password, confirm_password } = dto;
    this.logger.log(`Solicitud recibida para restablecer contraseña usando token.`);

    if (password !== confirm_password) {
      this.logger.warn(`Intento de cambio de contraseña falló: las contraseñas no coinciden.`);
      throw new BadRequestException('Las contraseñas no coinciden.');
    }

    const resetRecord = await this.passwordResetRepository.findOne({
      where: { reset_token },
    });

    if (!resetRecord || !resetRecord.verified) {
      this.logger.warn(`Intento de cambio de contraseña falló: token inválido o no verificado.`);
      throw new BadRequestException('Token inválido o no verificado.');
    }

    if (
      resetRecord.token_expires_at &&
      new Date() > new Date(resetRecord.token_expires_at)
    ) {
      this.logger.warn(`Intento de cambio de contraseña falló: el token ha expirado para el correo: ${resetRecord.email}`);
      throw new BadRequestException('El token ha expirado.');
    }

    const user = await this.userRepository.findOne({
      where: { id: resetRecord.user_id },
    });
    if (!user) {
      this.logger.warn(`Intento de cambio de contraseña falló: el usuario asociado al token no existe.`);
      throw new BadRequestException('Usuario no válido.');
    }

    const saltRounds = 10;
    user.password_hash = await bcrypt.hash(password, saltRounds);

    await this.userRepository.save(user);
    this.logger.log(`Contraseña actualizada con éxito para el usuario ID: ${user.id} (${user.email}).`);

    await this.passwordResetRepository.delete({ id: resetRecord.id });
    this.logger.log(`Registro de recuperación eliminado tras uso exitoso.`);

    return { success: true, message: 'Contraseña actualizada correctamente.' };
  }
}

