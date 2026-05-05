import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('subscription_plan_features')
export class SubscriptionPlanFeature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id' })
  plan_id: number;

  @Column({ type: 'varchar', length: 100 })
  feature_code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  feature_value: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => SubscriptionPlan, plan => plan.features, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;
}
