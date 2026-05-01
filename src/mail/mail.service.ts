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
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <!-- Header -->
            <div style="background-color: #1e293b; color: #ffffff; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">FlueGuard Soporte</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #94a3b8;">Nueva solicitud recibida desde la app</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px;">
              
              <!-- Meta info block -->
              <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
                <h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Detalles del Contacto</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 140px; font-size: 14px;">Tipo de consulta:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px;">${type}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Usuario ID:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 500; font-size: 14px;">${userId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Nombre:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 500; font-size: 14px;">${firstName} ${lastName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Email:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 500; font-size: 14px;">
                      <a href="mailto:${userEmail}" style="color: #3b82f6; text-decoration: none;">${userEmail}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Fecha y hora:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 500; font-size: 14px;">${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</td>
                  </tr>
                  ${environmentUrl ? `
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Ambiente:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 500; font-size: 14px;">
                      <a href="${environmentUrl}" style="color: #3b82f6; text-decoration: none;">${environmentUrl}</a>
                    </td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <!-- Message block -->
              <h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 16px;">Mensaje del usuario:</h3>
              <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 25px; border-radius: 8px; color: #334155; line-height: 1.6; font-size: 15px; white-space: pre-wrap; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">${message}</div>
              
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0;">Este es un correo automático generado por el sistema de soporte de FlueGuard.</p>
              <p style="margin: 5px 0 0 0;">Puedes responder directamente a este correo para contactar a <a href="mailto:${userEmail}" style="color: #3b82f6; text-decoration: none;">${userEmail}</a>.</p>
            </div>
          </div>
        </body>
        </html>
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
