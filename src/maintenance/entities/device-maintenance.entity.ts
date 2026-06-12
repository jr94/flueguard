import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';

@Entity('device_maintenance')
export class DeviceMaintenance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id', unique: true })
  device_id: number;

  @OneToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: { to: (v) => v, from: (v) => Number(v) },
  })
  usage_seconds_accumulated: number;

  @Column({ type: 'int', default: 80 })
  threshold_hours: number;

  @Column({ type: 'timestamp', nullable: true })
  last_notified_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_preventive_notified_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_urgent_notified_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_reset_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
