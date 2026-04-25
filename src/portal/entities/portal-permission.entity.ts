import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { PortalUser } from './portal-user.entity';

@Entity('portal_permissions')
export class PortalPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'portal_user_id' })
  portal_user_id: number;

  @Column({ name: 'can_view_dashboard', default: true })
  can_view_dashboard: boolean;

  @Column({ name: 'can_view_devices', default: true })
  can_view_devices: boolean;

  @Column({ name: 'can_view_telemetry', default: true })
  can_view_telemetry: boolean;

  @Column({ name: 'can_view_alerts', default: true })
  can_view_alerts: boolean;

  @Column({ name: 'can_view_logs', default: true })
  can_view_logs: boolean;

  @Column({ name: 'can_manage_devices', default: false })
  can_manage_devices: boolean;

  @Column({ name: 'can_manage_users', default: false })
  can_manage_users: boolean;

  @Column({ name: 'can_change_settings', default: false })
  can_change_settings: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToOne(() => PortalUser, (user) => user.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'portal_user_id' })
  portalUser: PortalUser;
}
