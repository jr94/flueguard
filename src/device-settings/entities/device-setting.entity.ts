import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Device } from '../../devices/entities/device.entity';

@Entity('device_settings')
export class DeviceSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'device_id' })
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ name: 'type_device', type: 'int', default: 0 })
  type_device: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  threshold_1: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  threshold_2: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  threshold_3: number;

  @Column({ name: 'notifications_enabled', default: true })
  notifications_enabled: boolean;

  @Column({ name: 'sound_alarm_enabled', default: true })
  sound_alarm_enabled: boolean;

  @Column({ name: 'alarm_low_temp', default: true })
  sound_alarm_temp_low: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
