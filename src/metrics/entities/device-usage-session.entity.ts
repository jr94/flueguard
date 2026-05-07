import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Device } from '../../devices/entities/device.entity';

@Entity('device_usage_sessions')
export class DeviceUsageSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id' })
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ type: 'timestamp' })
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  ended_at: Date;

  @Column({ type: 'int', default: 0 })
  duration_minutes: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  start_temperature: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  end_temperature: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  max_temperature: number;

  @Column({ type: 'timestamp', nullable: true })
  max_temperature_at: Date;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  avg_temperature: number;

  @Column({ type: 'int', default: 0 })
  safe_minutes: number;

  @Column({ type: 'int', default: 0 })
  warning_minutes: number;

  @Column({ type: 'int', default: 0 })
  critical_minutes: number;

  @Column({ type: 'int', default: 0 })
  low_minutes: number;

  @Column({ type: 'int', default: 0 })
  alerts_total: number;

  @Column({ type: 'int', default: 0 })
  alerts_level_1: number;

  @Column({ type: 'int', default: 0 })
  alerts_level_2: number;

  @Column({ type: 'int', default: 0 })
  alerts_level_3: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  efficiency_score: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  risk_score: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'closed';

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
