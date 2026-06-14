import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendForgotPasswordCode(email: string, code: string): Promise<void> {
    const apiKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      this.configService.get<string>('BREVO_SMTP_PASS');
    const senderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ||
      'no-reply@flueguard.cl';
    const senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') || 'FlueGuard';
    const resetPasswordUrl =
      this.configService.get<string>('FRONTEND_RESET_PASSWORD_URL') ||
      'https://flueguard.cl/reset-password';
    const link = `${resetPasswordUrl}?email=${encodeURIComponent(email)}&code=${code}`;

    this.logger.log(`Intentando enviar correo de recuperación a: ${email}`);

    try {
      const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            name: senderName,
            email: senderEmail,
          },
          to: [
            {
              email: email,
            },
          ],
          subject: 'Código de recuperación - FlueGuard',
          htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #1e293b; text-align: center; margin-bottom: 20px;">Recuperación de contraseña</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">Hemos recibido una solicitud para restablecer tu contraseña en FlueGuard.</p>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">Tu código de recuperación es:</p>
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 5px; padding: 20px; background-color: #f1f5f9; text-align: center; border-radius: 8px; margin: 24px 0; color: #1e293b; font-family: monospace;">
              ${code}
            </div>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">O también puedes hacer clic directamente en el siguiente enlace para restablecer tu contraseña:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="background-color: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">Restablecer Contraseña</a>
            </div>
            <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 20px;">Este código y enlace expirarán en 10 minutos.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña no cambiará.</p>
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
      this.logger.log(
        `Correo enviado con éxito a ${email}. Respuesta de Brevo status: ${response.status}. Message ID: ${response.data?.messageId}`,
      );
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message = data
        ? typeof data === 'object'
          ? JSON.stringify(data)
          : data
        : error.message;
      this.logger.error(
        `Error de Brevo al enviar correo a ${email}. Status Code: ${status}. Detalle: ${message}`,
      );
      throw error;
    }
  }

  async sendAccountDeletionEmail(email: string, link: string): Promise<void> {
    const apiKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      this.configService.get<string>('BREVO_SMTP_PASS');
    const senderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ||
      'no-reply@flueguard.cl';
    const senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') || 'FlueGuard';

    this.logger.log(
      `Intentando enviar correo de eliminación de cuenta a: ${email}`,
    );

    try {
      const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            name: senderName,
            email: senderEmail,
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
      this.logger.log(
        `Correo de eliminación de cuenta enviado con éxito a ${email}. ID de mensaje: ${response.data?.messageId}`,
      );
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message = data
        ? typeof data === 'object'
          ? JSON.stringify(data)
          : data
        : error.message;
      this.logger.error(
        `Error de Brevo al enviar correo de eliminación de cuenta a ${email}. Status Code: ${status}. Detalle: ${message}`,
      );
      throw error;
    }
  }

  async sendSupportEmail(
    userEmail: string,
    firstName: string,
    lastName: string,
    userId: number,
    type: string,
    message: string,
    environmentUrl: string,
  ): Promise<void> {
    const apiKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      this.configService.get<string>('BREVO_SMTP_PASS');
    const senderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ||
      'no-reply@flueguard.cl';
    const senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') ||
      'FlueGuard Soporte';

    this.logger.log(
      `Intentando enviar correo de soporte de: ${userEmail} (${firstName} ${lastName})`,
    );

    try {
      const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            name: senderName,
            email: senderEmail,
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
                    ${
                      environmentUrl
                        ? `
                    <tr>
                      <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Ambiente:</td>
                      <td style="padding: 8px 0; color: #0f172a; font-weight: 500; font-size: 14px;">
                        <a href="${environmentUrl}" style="color: #3b82f6; text-decoration: none;">${environmentUrl}</a>
                      </td>
                    </tr>
                    `
                        : ''
                    }
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
      this.logger.log(
        `Correo de soporte enviado con éxito. ID de mensaje: ${response.data?.messageId}`,
      );
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message = data
        ? typeof data === 'object'
          ? JSON.stringify(data)
          : data
        : error.message;
      this.logger.error(
        `Error de Brevo al enviar correo de soporte. Status Code: ${status}. Detalle: ${message}`,
      );
      throw error;
    }
  }
}
