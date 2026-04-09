import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Region } from './region.entity';

@Entity('comunas')
export class Comuna {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 150 })
  nombre: string;

  @Column({ name: 'region_id' })
  region_id: number;

  @ManyToOne(() => Region, region => region.comunas)
  @JoinColumn({ name: 'region_id' })
  region: Region;
}
