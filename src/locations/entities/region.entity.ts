import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Provincia } from './provincia.entity';

@Entity('regiones')
export class Region {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64 })
  region: string;

  @Column({ length: 4 })
  abreviatura: string;

  @Column({ length: 64 })
  capital: string;

  @OneToMany(() => Provincia, provincia => provincia.region)
  provincias: Provincia[];
}
