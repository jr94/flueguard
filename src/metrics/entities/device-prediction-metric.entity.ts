import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';

@Entity('device_prediction_metrics')
export class DevicePredictionMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id' })
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ type: 'timestamp' })
  predicted_at: Date;

  @Column('decimal', { precision: 5, scale: 2 })
  current_temperature: number;

  @Column('decimal', { precision: 5, scale: 2 })
  predicted_temperature: number;

  @Column({ type: 'int' })
  target_threshold: number;

  @Column({ type: 'int' })
  predicted_minutes_to_threshold: number;

  @Column('decimal', { precision: 8, scale: 4 })
  slope: number;

  @Column({ type: 'tinyint', default: 0 })
  was_confirmed: number;

  @Column({ type: 'timestamp', nullable: true })
  confirmed_at: Date;

  @Column({ type: 'tinyint', default: 0 })
  was_false_positive: number;

  @Column({ type: 'int', nullable: true })
  alert_id: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
