import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from './entities/region.entity';
import { Comuna } from './entities/comuna.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(Comuna)
    private readonly comunaRepository: Repository<Comuna>,
  ) {}

  async findAllRegiones(): Promise<Region[]> {
    return this.regionRepository.find({
      select: ['id', 'nombre'],
    });
  }

  async findComunasByRegion(regionId: number): Promise<Comuna[]> {
    const comunas = await this.comunaRepository.find({
      where: { region_id: regionId },
      select: ['id', 'nombre', 'region_id'],
    });

    if (!comunas || comunas.length === 0) {
      throw new NotFoundException(`No comunas found for region ${regionId}`);
    }

    return comunas;
  }
}
