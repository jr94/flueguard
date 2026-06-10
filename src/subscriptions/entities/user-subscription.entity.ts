import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';
import { SubscriptionEvent } from './subscription-event.entity';
import { User } from '../../users/entities/user.entity';

@Entity('user_subscriptions')
export class UserSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ name: 'plan_id' })
  plan_id: number;

  @Column({ type: 'enum', enum: ['active', 'trialing', 'past_due', 'canceled', 'expired'], default: 'active' })
  status: string;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_product_id: string | null;

  @Column({ name: 'provider_base_plan_id', type: 'varchar', length: 100, nullable: true })
  provider_base_plan_id: string | null;

  @Column({ name: 'provider_subscription_id', type: 'varchar', length: 255, nullable: true })
  provider_subscription_id: string | null;

  @Column({ name: 'provider_order_id', type: 'varchar', length: 255, nullable: true })
  provider_order_id: string | null;

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

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @OneToMany(() => SubscriptionEvent, event => event.userSubscription)
  events: SubscriptionEvent[];
}
