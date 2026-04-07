import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, Req, Delete, Put } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { ShareDeviceDto, UpdateDeviceShareDto } from './dto/share-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  create(@Body() createDeviceDto: CreateDeviceDto) {
    return this.devicesService.create(createDeviceDto);
  }

  @Get('my')
  findMyDevices(@Req() req: any) {
    const userId = req.user.id;
    return this.devicesService.findByUserId(userId);
  }

  @Get('user/:userId')
  findByUserId(@Param('userId', ParseIntPipe) userId: number) {
    return this.devicesService.findByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.devicesService.findOneWithAccess(id, req.user.id);
  }

  @Post(':id/share')
  shareDevice(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() dto: ShareDeviceDto,
  ) {
    return this.devicesService.shareDevice(id, req.user.id, dto);
  }

  @Get(':id/users')
  getDeviceUsers(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.devicesService.getDeviceUsers(id, req.user.id);
  }

  @Delete(':id/users/:userId')
  removeSharedUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userIdToRemove: number,
    @Req() req: any,
  ) {
    return this.devicesService.removeSharedUser(id, req.user.id, userIdToRemove);
  }

  @Put(':id/users/:userId')
  updateSharedUserPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userIdToUpdate: number,
    @Req() req: any,
    @Body() dto: UpdateDeviceShareDto,
  ) {
    return this.devicesService.updateSharedUserPermissions(id, req.user.id, userIdToUpdate, dto);
  }
}
