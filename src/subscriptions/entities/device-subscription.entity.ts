import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';
import { SubscriptionEvent } from './subscription-event.entity';
import { Device } from '../../devices/entities/device.entity';
import { User } from '../../users/entities/user.entity';

@Entity('device_subscriptions')
export class DeviceSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id' })
  device_id: number;

  @Column({ name: 'user_id', nullable: true })
  user_id: number;

  @Column({ name: 'plan_id' })
  plan_id: number;

  @Column({ type: 'enum', enum: ['active', 'trialing', 'past_due', 'canceled', 'expired'], default: 'active' })
  status: string;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_product_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_subscription_id: string | null;

  @Column({ type: 'text', nullable: true })
  provider_purchase_token: string | null;

  @Column({ type: 'datetime', nullable: true })
  started_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  current_period_start: Date | null;

  @Column({ type: 'datetime', nullable: true })
  current_period_end: Date | null;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  cancel_at_period_end: boolean;

  @Column({ type: 'datetime', nullable: true })
  canceled_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @OneToMany(() => SubscriptionEvent, event => event.deviceSubscription)
  events: SubscriptionEvent[];
}
