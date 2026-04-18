import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { FirmwareService } from './firmware.service';
import { CheckFirmwareDto } from './dto/check-firmware.dto';

// Escucha en /firmware independientemente del prefijo global, para mantener compatibilidad con la solicitud
@Controller('firmware')
export class FirmwareController {
  constructor(private readonly firmwareService: FirmwareService) {}

  @Get('latest.json')
  async getLatestVersion() {
    return await this.firmwareService.getLatestVersion();
  }

  @Get('versions.json')
  async getVersions() {
    return await this.firmwareService.getVersions();
  }

  @Get('check')
  async checkUpdate(@Query() query: CheckFirmwareDto) {
    if (!query.version) {
      throw new HttpException('El parámetro "version" es obligatorio.', HttpStatus.BAD_REQUEST);
    }
    return await this.firmwareService.checkUpdate(query);
  }
}
