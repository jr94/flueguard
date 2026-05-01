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

  async sendAccountDeletionEmail(email: string, link: string): Promise<void> {
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
        subject: 'Eliminación de cuenta - FlueGuard',
        htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d9534f;">Solicitud de Eliminación de Cuenta</h2>
          <p>Hemos recibido una solicitud para eliminar tu cuenta en FlueGuard.</p>
          <p>Para confirmar y proceder con la eliminación de tu cuenta y todos tus datos asociados, por favor haz clic en el siguiente enlace:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #d9534f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Confirmar Eliminación de Cuenta</a>
          </div>
          <p style="color: #666; font-size: 14px;">Este enlace expirará en 30 minutos.</p>
          <p style="color: #999; font-size: 12px; margin-top: 40px;">Si no fuiste tú quien solicitó esto, puedes ignorar este correo y tu cuenta seguirá intacta.</p>
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

  async sendSupportEmail(
    userEmail: string,
    firstName: string,
    lastName: string,
    userId: number,
    type: string,
    message: string,
    environmentUrl: string
  ): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');

    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: 'FlueGuard Soporte',
          email: 'no-reply@flueguard.cl',
        },
        to: [
          {
            email: 'jose.riquelme94@gmail.com',
          },
        ],
        subject: `[FlueGuard Soporte] Nueva consulta: ${type}`,
        htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Nueva solicitud de soporte</h2>
          <p><strong>Tipo de consulta:</strong> ${type}</p>
          <p><strong>Usuario ID:</strong> ${userId}</p>
          <p><strong>Nombre:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <p><strong>Fecha y hora:</strong> ${new Date().toLocaleString('es-CL')}</p>
          ${environmentUrl ? `<p><strong>Ambiente/URL:</strong> ${environmentUrl}</p>` : ''}
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <h3 style="color: #333;">Mensaje del usuario:</h3>
          <p style="white-space: pre-wrap; background-color: #f9f9f9; padding: 15px; border-radius: 5px;">${message}</p>
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
