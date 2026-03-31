import { Controller, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';

// Protegemos el endpoint con un token genérico embebido en lugar de la estrategia JWT
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('run-cleanup')
  runCleanup(@Headers('authorization') authHeader: string) {
    const expectedToken = 'token-clean-123456789';
    // Permitir el token tanto enviándolo directamente o como Bearer token
    if (!authHeader || (authHeader !== expectedToken && authHeader !== `Bearer ${expectedToken}`)) {
      throw new UnauthorizedException('Invalid or missing generic token');
    }
    return this.maintenanceService.runCleanup();
  }
}
