import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne } from 'typeorm';
import { PortalPermission } from './portal-permission.entity';

@Entity('portal_users')
export class PortalUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'first_name', length: 100 })
  first_name: string;

  @Column({ name: 'last_name', length: 100, nullable: true })
  last_name: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password' })
  password: string;

  @Column({ type: 'enum', enum: ['admin', 'monitor'], default: 'monitor' })
  role: 'admin' | 'monitor';

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  last_login_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToOne(() => PortalPermission, (permission) => permission.portalUser, { cascade: true })
  permissions: PortalPermission;
}
