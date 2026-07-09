import { Module, Controller, Get, Res } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import type { Response } from 'express';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AlertsModule } from './alerts/alerts.module';
import { DeviceSettingsModule } from './device-settings/device-settings.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { PushTokensModule } from './push-tokens/push-tokens.module';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Hello World!';
  }

  @Get('links')
  getLinksPage(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'links.html'));
  }
}
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { ForgotPasswordModule } from './auth/forgot-password/forgot-password.module';
import { MailModule } from './mail/mail.module';
import { LocationsModule } from './locations/locations.module';
import { FirmwareModule } from './firmware/firmware.module';
import { DeviceFirmwareUpdatesModule } from './device-firmware-updates/device-firmware-updates.module';
import { AccountDeletionModule } from './account-deletion/account-deletion.module';
import { PortalModule } from './portal/portal.module';
import { SupportModule } from './support/support.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { MetricsModule } from './metrics/metrics.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ManualesModule } from './manuales/manuales.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: [
        '/api/:path*',
        '/firmware/check',
        '/firmware/latest.json',
        '/firmware/versions.json',
      ],
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
    FirmwareModule,
    DeviceFirmwareUpdatesModule,
    AccountDeletionModule,
    PortalModule,
    SupportModule,
    SubscriptionsModule,
    MetricsModule,
    ManualesModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
