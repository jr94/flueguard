import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { ShareDeviceDto } from './dto/share-device.dto';
import { UpdateShareDeviceDto } from './dto/update-share-device.dto';
import { RemoveDeviceDto } from './dto/remove-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  create(@Body() createDeviceDto: CreateDeviceDto) {
    return this.devicesService.create(createDeviceDto);
  }

  @Get('user/:userId')
  findByUserId(@Param('userId', ParseIntPipe) userId: number) {
    return this.devicesService.findByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.devicesService.findOne(id);
  }

  @Post('shared/add')
  shareDevice(@Body() shareDeviceDto: ShareDeviceDto) {
    return this.devicesService.shareDevice(shareDeviceDto);
  }

  @Delete('shared/delete')
  unshareDevice(@Body() shareDeviceDto: ShareDeviceDto) {
    return this.devicesService.unshareDevice(shareDeviceDto);
  }

  @Put('shared/edit')
  updateSharePermission(@Body() updateShareDeviceDto: UpdateShareDeviceDto) {
    return this.devicesService.updateSharePermission(updateShareDeviceDto);
  }

  @Get(':deviceId/shared')
  getSharedUsers(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.devicesService.getSharedUsers(deviceId, userId);
  }

  @Delete('remove-by-serial')
  removeBySerial(@Body() removeDeviceDto: RemoveDeviceDto, @Req() req: any) {
    const userId = req.user.id;
    return this.devicesService.removeBySerial(removeDeviceDto.serial_number, userId);
  }
}
