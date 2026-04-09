import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('BREVO_SMTP_HOST'),
      port: this.configService.get<number>('BREVO_SMTP_PORT'),
      auth: {
        user: this.configService.get<string>('BREVO_SMTP_USER'),
        pass: this.configService.get<string>('BREVO_SMTP_PASS'),
      },
    });
  }

  async sendForgotPasswordCode(to: string, code: string): Promise<void> {
    const mailOptions = {
      from: this.configService.get<string>('MAIL_FROM', '"FlueGuard" <no-reply@flueguard.cl>'),
      to,
      subject: 'Código de recuperación - FlueGuard',
      html: `
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
    };

    await this.transporter.sendMail(mailOptions);
  }
}
