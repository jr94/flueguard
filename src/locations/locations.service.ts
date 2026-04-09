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

  async findAllRegiones(): Promise<any[]> {
    const regiones = await this.regionRepository.find({
      select: ['id', 'region'],
    });
    return regiones.map(r => ({ id: r.id, nombre: r.region }));
  }

  async findComunasByRegion(regionId: number): Promise<any[]> {
    const comunas = await this.comunaRepository.find({
      relations: ['provincia'],
      where: { provincia: { region_id: regionId } }
    });

    if (!comunas || comunas.length === 0) {
      throw new NotFoundException(`No comunas found for region ${regionId}`);
    }

    return comunas.map(c => ({
      id: c.id,
      nombre: c.comuna,
      region_id: c.provincia.region_id
    }));
  }
}
