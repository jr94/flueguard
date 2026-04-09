import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Provincia } from './provincia.entity';

@Entity('comunas')
export class Comuna {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64 })
  comuna: string;

  @Column({ name: 'provincia_id' })
  provincia_id: number;

  @ManyToOne(() => Provincia, provincia => provincia.comunas)
  @JoinColumn({ name: 'provincia_id' })
  provincia: Provincia;
}
