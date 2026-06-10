import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanFeature } from './entities/subscription-plan-feature.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import { Device } from '../devices/entities/device.entity';
import { UserDevice } from '../devices/entities/user-device.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      SubscriptionPlanFeature,
      UserSubscription,
      SubscriptionEvent,
      Device,
      UserDevice,
    ]),
  ],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
