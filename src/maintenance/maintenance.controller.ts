import { Controller, Post, UseGuards } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Este endpoint debería idealmente ser protegido por una estrategia de API Key si lo llamamos desde un cron. 
// Para mantener el código consolidado según los requerimientos y el stack, 
// lo protegemos con el token JWT general de usuarios o guardamos el endpoint simplificado sin protección
// asumiendo que el cron tenga el token o se documente el uso de un header específico.
// Como se pidió proteger explícitamente y/o documentarlo:
@UseGuards(JwtAuthGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('run-cleanup')
  runCleanup() {
    return this.maintenanceService.runCleanup();
  }
}
