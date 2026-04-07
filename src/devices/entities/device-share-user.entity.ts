import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Device } from './device.entity';

@Entity('device_shares_users')
export class DeviceShareUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id' })
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'can_edit_settings', default: false })
  can_edit_settings: boolean;

  @Column({ name: 'can_silence_alarm', default: false })
  can_silence_alarm: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
