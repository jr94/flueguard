import { Controller, Get, Put, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDeviceNotificationsDto } from './dto/update-user-device-notifications.dto';

@UseGuards(JwtAuthGuard)
@Controller('user-devices')
export class UserDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get(':deviceId/notifications')
  getNotificationsStatus(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.devicesService.getNotificationsStatus(deviceId, userId);
  }

  @Put(':deviceId/notifications')
  updateNotifications(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() updateDto: UpdateUserDeviceNotificationsDto,
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.devicesService.updateNotifications(deviceId, userId, updateDto.notifications_enabled);
  }
}
