import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushNotificationsService } from './push-notifications.service';
import { DevicePushToken } from '../push-tokens/entities/device-push-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DevicePushToken])],
  providers: [PushNotificationsService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
