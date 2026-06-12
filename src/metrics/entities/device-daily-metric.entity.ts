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

@Entity('device_daily_metrics')
export class DeviceDailyMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id' })
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ type: 'date' })
  metric_date: string | Date;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  usage_minutes: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  max_temperature: number;

  @Column({ type: 'timestamp', nullable: true })
  max_temperature_at: Date;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  min_temperature: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  avg_temperature: number;

  @Column({ type: 'int', default: 0 })
  logs_count: number;

  @Column({ type: 'int', default: 0 })
  sessions_count: number;

  @Column({ type: 'int', default: 0 })
  safe_minutes: number;

  @Column({ type: 'int', default: 0 })
  warning_minutes: number;

  @Column({ type: 'int', default: 0 })
  critical_minutes: number;

  @Column({ type: 'int', default: 0 })
  low_minutes: number;

  @Column({ type: 'int', default: 0 })
  off_minutes: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  efficient_minutes: number;

  @Column({ type: 'int', default: 0 })
  alerts_total: number;

  @Column({ type: 'int', default: 0 })
  alerts_level_1: number;

  @Column({ type: 'int', default: 0 })
  alerts_level_2: number;

  @Column({ type: 'int', default: 0 })
  alerts_level_3: number;

  @Column({ type: 'int', default: 0 })
  predictions_total: number;

  @Column({ type: 'int', default: 0 })
  predictions_confirmed: number;

  @Column({ type: 'int', default: 0 })
  predictions_false_positive: number;

  @Column({ type: 'int', default: 0 })
  usage_samples: number;

  @Column({ type: 'int', default: 0 })
  efficient_samples: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  efficiency_score: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  risk_score: number;

  @Column({ type: 'int', nullable: true })
  threshold_1_snapshot: number;

  @Column({ type: 'int', nullable: true })
  threshold_2_snapshot: number;

  @Column({ type: 'int', nullable: true })
  threshold_3_snapshot: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
