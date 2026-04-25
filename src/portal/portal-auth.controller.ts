import { Controller, Post, Body, Put, Param, ParseIntPipe, UseGuards, Request, Get, ForbiddenException, Delete } from '@nestjs/common';
import { PortalAuthService } from './portal-auth.service';
import { PortalLoginDto } from './dto/portal-login.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceFirmwareUpdatesService } from '../device-firmware-updates/device-firmware-updates.service';
import { UsersService } from '../users/users.service';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

class PortalOtaRequestDto {
  @IsString() @IsNotEmpty() serial_number: string;
  @IsString() @IsNotEmpty() version: string;
  @IsBoolean() @IsOptional() mandatory?: boolean;
  @IsString() @IsOptional() notes?: string;
}

@Controller('portal/auth')
export class PortalAuthController {
  constructor(
    private readonly portalAuthService: PortalAuthService,
    private readonly firmwareUpdatesService: DeviceFirmwareUpdatesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * POST /api/portal/auth/login
   * Login exclusivo del portal web — usa portal_users + portal_permissions
   */
  @Post('login')
  async login(@Body() dto: PortalLoginDto) {
    return this.portalAuthService.login(dto);
  }

  /**
   * GET /api/portal/auth/me
   * Devuelve el usuario del portal con sus permisos (refresco de sesión)
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req) {
    const user = await this.portalAuthService.findUserById(req.user.id);
    if (!user) throw new ForbiddenException('Usuario del portal no encontrado');
    const { password: _, ...safeUser } = user as any;
    return safeUser;
  }

  /**
   * PUT /api/portal/auth/profile/:id
   * Actualiza nombre/apellido/contraseña del usuario del portal
   */
  @UseGuards(JwtAuthGuard)
  @Put('profile/:id')
  async updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { first_name?: string; last_name?: string; password?: string },
  ) {
    // Solo puede editar su propio perfil
    if (req.user.id !== id) {
      throw new ForbiddenException('No puede editar el perfil de otro usuario');
    }
    const updated = await this.portalAuthService.updateProfile(id, body);
    const { password: _, ...safeUser } = updated as any;
    return safeUser;
  }

  // ── FlueGuard Users Management (users table) ───────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('flueguard-users')
  async getFlueGuardUsers(@Request() req) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post('flueguard-users')
  async createFlueGuardUser(@Request() req, @Body() dto: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.usersService.adminCreate(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('flueguard-users/:id')
  async updateFlueGuardUser(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() dto: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.usersService.adminUpdate(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('flueguard-users/:id')
  async deleteFlueGuardUser(@Param('id', ParseIntPipe) id: number, @Request() req) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.usersService.delete(id);
  }

  // ── Monitoring Users Management (portal_users table) ───────────────────

  @UseGuards(JwtAuthGuard)
  @Get('monitoring-users')
  async getMonitoringUsers(@Request() req) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.portalAuthService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post('monitoring-users')
  async createMonitoringUser(@Request() req, @Body() dto: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.portalAuthService.createPortalUser(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('monitoring-users/:id')
  async updateMonitoringUser(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() dto: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.portalAuthService.updatePortalUser(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('monitoring-users/:id')
  async deleteMonitoringUser(@Param('id', ParseIntPipe) id: number, @Request() req) {
    if (req.user.role !== 'admin') throw new ForbiddenException('No tienes permisos');
    return this.portalAuthService.deletePortalUser(id);
  }
  /**
   * POST /api/portal/firmware/request
   * Solicita una actualización OTA desde el portal.
   * No requiere validación de user_devices — el portal gestiona todos los dispositivos.
   */
  @UseGuards(JwtAuthGuard)
  @Post('/firmware/request')
  async requestOta(@Body() dto: PortalOtaRequestDto) {
    // Llama al service con userId=0 y luego hace el request directamente
    // sin la validación de owner en user_devices
    return this.firmwareUpdatesService.requestOtaFromPortal(dto.serial_number, dto.version, dto.mandatory, dto.notes);
  }
}
