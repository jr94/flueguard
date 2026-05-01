import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupportService {
  constructor(
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async sendSupportRequest(userId: number, createSupportRequestDto: CreateSupportRequestDto) {
    try {
      const user = await this.usersService.findOne(userId);
      const userEmail = user?.email || 'No disponible';
      const firstName = user?.first_name || 'No disponible';
      const lastName = user?.last_name || '';
      
      const envUrl = this.configService.get<string>('BASE_URL') || this.configService.get<string>('PORTAL_URL') || '';

      await this.mailService.sendSupportEmail(
        userEmail,
        firstName,
        lastName,
        userId,
        createSupportRequestDto.type,
        createSupportRequestDto.message,
        envUrl,
      );

      return {
        success: true,
        message: 'Solicitud de soporte enviada correctamente',
      };
    } catch (error) {
      console.error('Error enviando solicitud de soporte:', error);
      throw new InternalServerErrorException({
        success: false,
        message: 'No se pudo enviar la solicitud de soporte. Intenta nuevamente más tarde.',
      });
    }
  }
}
