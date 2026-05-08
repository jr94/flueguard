import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Device } from '../../devices/entities/device.entity';

@Entity('device_reports')
export class DeviceReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id' })
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ type: 'varchar', length: 20 })
  report_type: 'weekly' | 'monthly';

  @Column({ type: 'date' })
  period_start: Date;

  @Column({ type: 'date' })
  period_end: Date;

  @Column({ type: 'int', default: 0 })
  total_usage_minutes: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  max_temperature: number;

  @Column({ type: 'timestamp', nullable: true })
  max_temperature_at: Date | null;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  avg_temperature: number;

  @Column({ type: 'int', default: 0 })
  total_sessions: number;

  @Column({ type: 'int', default: 0 })
  total_alerts: number;

  @Column({ type: 'int', default: 0 })
  total_critical_alerts: number;

  @Column({ type: 'int', default: 0 })
  safe_minutes: number;

  @Column({ type: 'int', default: 0 })
  warning_minutes: number;

  @Column({ type: 'int', default: 0 })
  critical_minutes: number;

  @Column({ type: 'int', default: 0 })
  low_minutes: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  efficiency_score: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  risk_score: number;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  recommendation: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
