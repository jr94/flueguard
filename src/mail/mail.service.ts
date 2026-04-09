import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async sendForgotPasswordCode(email: string, code: string): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');

    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: 'FlueGuard',
          email: 'no-reply@flueguard.cl',
        },
        to: [
          {
            email: email,
          },
        ],
        subject: 'Código de recuperación - FlueGuard',
        htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Recuperación de contraseña</h2>
          <p>Hemos recibido una solicitud para cambiar tu contraseña.</p>
          <p>Tu código de recuperación es:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 20px; background-color: #f5f5f5; text-align: center; border-radius: 8px; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">Este código expirará en 10 minutos.</p>
          <p style="color: #999; font-size: 12px; margin-top: 40px;">Si no solicitaste este código, puedes ignorar este correo de forma segura.</p>
        </div>
        `,
      },
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
