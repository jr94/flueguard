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
  ) { }

  async sendAlertNotification(deviceId: number, alert: any, serialNumber: string = ''): Promise<void> {
    try {
      // 1. Obtener tokens activos para todos los usuarios asociados al dispositivo
      const activeTokens = await this.pushTokenRepository.query(
        `SELECT pt.id, pt.fcm_token, d.device_name, pt.user_id, ud.notifications_enabled
        FROM user_devices ud
        INNER JOIN device_push_tokens pt
          ON pt.user_id = ud.user_id
        INNER JOIN devices d
          ON d.id = ud.device_id
        WHERE ud.device_id = ?
          AND pt.is_active = 1`,
        [deviceId]
      );

      if (!activeTokens || activeTokens.length === 0) {
        console.log(`[PUSH] No hay tokens activos para usuarios vinculados al device_id ${deviceId}`);
        return; // Si no hay tokens activos para los usuarios de este dispositivo, salimos
      }

      const deviceName = activeTokens[0].device_name || 'Dispositivo';
      const title = `${deviceName}`;
      const body = `${alert.message || 'Alerta de temperatura: se requiere revisión de la estufa.'}`;

      const level = String(alert.alert_level || '1');
      const channelKey = `flueguard_alert_l${level}`;
      const soundKey = `alert_sound_l${level}`;

      const messagePayload = {
        android: {
          priority: 'high' as const,
        },
        data: {
          title: String(title),
          body: String(body),
          alert_id: String(alert.id || ''),
          device_id: String(deviceId),
          serial_number: String(serialNumber || ''),
          device_name: String(deviceName || 'Dispositivo'),
          alert_level: level,
          temperature: String(alert.temperature ?? ''),
          channel_key: channelKey,
          sound_key: soundKey,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      };

      // 2. Iterate and send notification
      let tokensEnviados = 0;
      const alertLevel = Number(alert.alert_level || 1);
      const isCriticalAlert = alertLevel === 3;

      for (const record of activeTokens) {
        if (!isCriticalAlert && !record.notifications_enabled) {
          console.log(`[PUSH] Usuario ${record.user_id} tiene notificaciones desactivadas para device_id ${deviceId}`);
          continue;
        }

        if (isCriticalAlert && !record.notifications_enabled) {
          console.log(`[PUSH] Alerta crítica nivel 3: se ignora switch desactivado del usuario ${record.user_id} para device_id ${deviceId}`);
        }

        tokensEnviados++;
        console.log(`[PUSH] Enviando alerta nivel ${alertLevel} a usuario ${record.user_id} para device_id ${deviceId}`);
        try {
          // Verify we have Firebase mapped properly
          if (admin.apps.length > 0) {
            await admin.messaging().send({
              token: record.fcm_token,
              android: messagePayload.android,
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

      if (tokensEnviados === 0 && activeTokens.length > 0) {
        console.log(`[PUSH] No hay usuarios con notificaciones habilitadas para device_id ${deviceId}`);
      }
    } catch (err) {
      // Bloque general que encapsula y prohíbe explícitamente cualquier crasheo exterior
      console.error('Error crítico no manejado en PushNotificationsService:', err);
    }
  }
}
