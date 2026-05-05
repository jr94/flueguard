import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SubscriptionPlanFeature } from './subscription-plan-feature.entity';
import { DeviceSubscription } from './device-subscription.entity';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'int', nullable: true })
  price_monthly: number;

  @Column({ type: 'varchar', length: 10, default: 'CLP' })
  currency: string;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => SubscriptionPlanFeature, feature => feature.plan)
  features: SubscriptionPlanFeature[];

  @OneToMany(() => DeviceSubscription, subscription => subscription.plan)
  deviceSubscriptions: DeviceSubscription[];
}
