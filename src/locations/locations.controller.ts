import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('regiones')
  getRegiones() {
    return this.locationsService.findAllRegiones();
  }

  @Get('region/:id')
  getComunasByRegion(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.findComunasByRegion(id);
  }
}
