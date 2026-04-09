import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AlertsModule } from './alerts/alerts.module';
import { DeviceSettingsModule } from './device-settings/device-settings.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { PushTokensModule } from './push-tokens/push-tokens.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { ForgotPasswordModule } from './auth/forgot-password/forgot-password.module';
import { MailModule } from './mail/mail.module';
import { LocationsModule } from './locations/locations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('MYSQL_HOST'),
        port: configService.get<number>('MYSQL_PORT'),
        username: configService.get<string>('MYSQL_USER'),
        password: configService.get<string>('MYSQL_PASSWORD'),
        database: configService.get<string>('MYSQL_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    UsersModule,
    DevicesModule,
    TelemetryModule,
    AlertsModule,
    DeviceSettingsModule,
    MaintenanceModule,
    PushTokensModule,
    PushNotificationsModule,
    ForgotPasswordModule,
    MailModule,
    LocationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}