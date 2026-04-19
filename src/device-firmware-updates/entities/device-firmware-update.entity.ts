import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('device_firmware_updates')
export class DeviceFirmwareUpdate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  device_id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  request_id: string;

  @Column({ type: 'varchar', length: 50 })
  target_version: string;

  @Column({ type: 'varchar', length: 255 })
  file_url: string;

  @Column({ type: 'varchar', length: 100 })
  sha256: string;

  @Column({ type: 'int' })
  size_bytes: number;

  @Column({ type: 'boolean', default: false })
  mandatory: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: ['pending', 'in_progress', 'completed', 'failed', 'canceled'], default: 'pending' })
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'canceled';

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string;

  @Column({ type: 'datetime', nullable: true })
  last_seen_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
