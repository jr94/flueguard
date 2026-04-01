import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class DeviceStaticTokenGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    const expectedToken = 'getSetting-token-29071994';
    
    // Check if the auth token is our static token
    if (
      authHeader &&
      (authHeader === expectedToken || authHeader === `Bearer ${expectedToken}`)
    ) {
      return true;
    }

    // Fallback to exactly what JwtAuthGuard does
    return super.canActivate(context);
  }
}
