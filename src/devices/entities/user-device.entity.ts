import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Device } from './device.entity';

@Entity('user_devices')
export class UserDevice {
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

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  owner: boolean;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  edit: boolean;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  notifications_enabled: boolean;
}
