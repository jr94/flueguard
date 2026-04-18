import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class Esp32AuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Allow either header "x-device-secret" or standard "Authorization: Bearer"
    const xDeviceSecret = request.headers['x-device-secret'];
    const authHeader = request.headers.authorization;
    
    const expectedSecret = this.configService.get<string>('ESP32_API_SECRET');

    if (!expectedSecret) {
      throw new UnauthorizedException('ESP32 API secret is not configured on the server');
    }

    if (xDeviceSecret === expectedSecret) {
      return true;
    }

    if (authHeader && (authHeader === expectedSecret || authHeader === `Bearer ${expectedSecret}`)) {
      return true;
    }

    throw new UnauthorizedException('Invalid ESP32 credentials');
  }
}
