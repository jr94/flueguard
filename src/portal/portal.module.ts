import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PortalUser } from './entities/portal-user.entity';
import { PortalPermission } from './entities/portal-permission.entity';
import { PortalAuthService } from './portal-auth.service';
import { PortalAuthController } from './portal-auth.controller';
import { AuthModule } from '../auth/auth.module'; // re-usa JwtAuthGuard

@Module({
  imports: [
    TypeOrmModule.forFeature([PortalUser, PortalPermission]),
    AuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRATION') || '30d') as any },
      }),
    }),
  ],
  providers: [PortalAuthService],
  controllers: [PortalAuthController],
  exports: [PortalAuthService],
})
export class PortalModule {}
