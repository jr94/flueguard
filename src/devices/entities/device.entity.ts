import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'serial_number', length: 100, unique: true })
  serial_number: string;

  @Column({ name: 'device_name', length: 150 })
  device_name: string;

  @Column({ default: 'offline', length: 50 })
  status: string;

  @Column({ type: 'timestamp', nullable: true, name: 'last_connection' })
  last_connection: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ip_address: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
