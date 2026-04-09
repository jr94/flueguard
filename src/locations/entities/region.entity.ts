import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Comuna } from './comuna.entity';

@Entity('regiones')
export class Region {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 150 })
  nombre: string;

  @OneToMany(() => Comuna, comuna => comuna.region)
  comunas: Comuna[];
}
