import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Region } from './region.entity';
import { Comuna } from './comuna.entity';

@Entity('provincias')
export class Provincia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64 })
  provincia: string;

  @Column({ name: 'region_id' })
  region_id: number;

  @ManyToOne(() => Region, region => region.provincias)
  @JoinColumn({ name: 'region_id' })
  region: Region;

  @OneToMany(() => Comuna, comuna => comuna.provincia)
  comunas: Comuna[];
}
