import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DeviceSubscription } from './device-subscription.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('subscription_events')
export class SubscriptionEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_subscription_id', nullable: true })
  device_subscription_id: number;

  @Column({ name: 'device_id', nullable: true })
  device_id: number;

  @Column({ name: 'user_id', nullable: true })
  user_id: number;

  @Column({ name: 'plan_id', nullable: true })
  plan_id: number;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  provider: string;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_event_id: string | null;

  @Column({ type: 'json', nullable: true })
  raw_payload: any;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => DeviceSubscription, sub => sub.events, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_subscription_id' })
  deviceSubscription: DeviceSubscription;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;
}
