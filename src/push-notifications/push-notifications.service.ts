import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { DevicePushToken } from '../push-tokens/entities/device-push-token.entity';

@Injectable()
export class PushNotificationsService {
  constructor(
    @InjectRepository(DevicePushToken)
    private readonly pushTokenRepository: Repository<DevicePushToken>,
  ) {}

  async sendAlertNotification(deviceId: number, alert: any): Promise<void> {
    try {
      // 1. Fetch active tokens for the device
      const activeTokens = await this.pushTokenRepository.find({
        where: { device_id: deviceId, is_active: 1 },
      });

      if (!activeTokens || activeTokens.length === 0) {
        return; // Si no hay tokens para el dispositivo evitamos mandar nada
      }

      const messagePayload = {
        notification: {
          title: 'FlueGuard: Alerta de temperatura',
          body: `Nivel ${alert.alert_level}: ${alert.message || 'Se detectó sobretemperatura'}`,
        },
        data: {
          alert_id: String(alert.id),
          device_id: String(deviceId),
          alert_level: String(alert.alert_level),
          temperature: String(alert.temperature ?? ''),
        },
      };

      // 2. Iterate and send notification
      for (const record of activeTokens) {
        try {
          // Verify we have Firebase mapped properly
          if (admin.apps.length > 0) {
            await admin.messaging().send({
              token: record.fcm_token,
              notification: messagePayload.notification,
              data: messagePayload.data,
            });
            console.log(`FCM enviado correctamente a device ID ${deviceId} (Token: ...${record.fcm_token.slice(-5)})`);
          } else {
            console.warn('Firebase Admin no está inicializado. Se omite envío de push.');
          }
        } catch (error: any) {
          console.error(`Error enviando FCM para device ${deviceId}: ${error.message}`);
          
          // 3. Mark broken token as inactive
          if (
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered'
          ) {
            await this.pushTokenRepository.update(record.id, { is_active: 0 });
            console.log(`Token FCM invalidado por rechazo de servidor.`);
          }
        }
      }
    } catch (err) {
      // Bloque general que encapsula y prohíbe explícitamente cualquier crasheo exterior
      console.error('Error crítico no manejado en PushNotificationsService:', err);
    }
  }
}
