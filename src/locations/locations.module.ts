import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { Region } from './entities/region.entity';
import { Provincia } from './entities/provincia.entity';
import { Comuna } from './entities/comuna.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Region, Provincia, Comuna])],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
