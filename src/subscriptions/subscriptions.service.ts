import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanFeature } from './entities/subscription-plan-feature.entity';
import { DeviceSubscription } from './entities/device-subscription.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import { ManualActivateSubscriptionDto } from './dto/manual-activate-subscription.dto';
import { ManualCancelSubscriptionDto } from './dto/manual-cancel-subscription.dto';
import { Device } from '../devices/entities/device.entity';
import { In } from 'typeorm';
import { GooglePlayVerifyDto } from './dto/google-play-verify.dto';
import { google } from 'googleapis';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(SubscriptionPlanFeature)
    private readonly featureRepository: Repository<SubscriptionPlanFeature>,
    @InjectRepository(DeviceSubscription)
    private readonly deviceSubscriptionRepository: Repository<DeviceSubscription>,
    @InjectRepository(SubscriptionEvent)
    private readonly eventRepository: Repository<SubscriptionEvent>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  public parseFeatureValue(value: string): boolean | number | string | null {
    if (value === null || value === undefined) return null;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (value.trim() !== '') {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }
    return value;
  }

  async getActivePlans(): Promise<any[]> {
    const plans = await this.planRepository.find({
      where: { is_active: true },
      relations: ['features'],
    });

    return plans.map(plan => {
      const featuresObj: any = {};
      plan.features.forEach(f => {
        featuresObj[f.feature_code] = this.parseFeatureValue(f.feature_value);
      });

      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        price_monthly: plan.price_monthly,
        currency: plan.currency,
        features: featuresObj,
      };
    });
  }

  async validateUserDeviceAccess(userId: number, deviceId: number): Promise<Device> {
    const device = await this.deviceRepository.createQueryBuilder('device')
      .innerJoin('user_devices', 'ud', 'ud.device_id = device.id')
      .where('device.id = :deviceId', { deviceId })
      .andWhere('ud.user_id = :userId', { userId })
      .getOne();

    if (!device) {
      const exists = await this.deviceRepository.findOne({ where: { id: deviceId } });
      if (!exists) {
        throw new NotFoundException('Device not found');
      }
      throw new ForbiddenException('You do not have access to this device');
    }
    return device;
  }

  async getActiveSubscriptionsForDevices(deviceIds: number[]): Promise<Map<number, any>> {
    const map = new Map<number, any>();
    if (!deviceIds || deviceIds.length === 0) return map;

    const subscriptions = await this.deviceSubscriptionRepository.createQueryBuilder('ds')
      .innerJoinAndSelect('ds.plan', 'sp')
      .leftJoinAndSelect('sp.features', 'spf')
      .where('ds.device_id IN (:...deviceIds)', { deviceIds })
      .andWhere('ds.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .andWhere('ds.current_period_end > NOW()')
      .andWhere('sp.is_active = 1')
      .orderBy('ds.current_period_end', 'DESC')
      .getMany();

    // The order is DESC, so the first one we encounter for a device is the most recent
    for (const sub of subscriptions) {
      if (!map.has(sub.device_id)) {
        map.set(sub.device_id, {
          is_active: true,
          status: sub.status,
          plan_code: sub.plan.code,
          plan_name: sub.plan.name,
          current_period_end: sub.current_period_end,
        });
      }
    }

    return map;
  }

  async getDeviceSubscriptionStatus(deviceId: number, userId?: number): Promise<any> {
    if (userId) {
      await this.validateUserDeviceAccess(userId, deviceId);
    }

    const subscription = await this.deviceSubscriptionRepository.createQueryBuilder('ds')
      .innerJoinAndSelect('ds.plan', 'sp')
      .leftJoinAndSelect('sp.features', 'spf')
      .where('ds.device_id = :deviceId', { deviceId })
      .andWhere('ds.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .andWhere('ds.current_period_end > NOW()')
      .andWhere('sp.is_active = 1')
      .orderBy('ds.current_period_end', 'DESC')
      .getOne();

    if (!subscription) {
      return {
        device_id: deviceId,
        is_active: false,
        status: 'inactive',
        plan: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        features: {},
      };
    }

    const featuresObj: any = {};
    if (subscription.plan && subscription.plan.features) {
      subscription.plan.features.forEach(f => {
        featuresObj[f.feature_code] = this.parseFeatureValue(f.feature_value);
      });
    }

    return {
      device_id: deviceId,
      is_active: true,
      status: subscription.status,
      plan: {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
      },
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      features: featuresObj,
    };
  }

  async getDeviceFeatures(deviceId: number, userId?: number): Promise<any> {
    const status = await this.getDeviceSubscriptionStatus(deviceId, userId);
    if (!status.is_active) {
      return {
        device_id: deviceId,
        is_active: false,
        plan_code: null,
        features: {},
      };
    }

    return {
      device_id: deviceId,
      is_active: true,
      plan_code: status.plan.code,
      features: status.features,
    };
  }

  async deviceHasFeature(deviceId: number, featureCode: string): Promise<any> {
    const status = await this.getDeviceSubscriptionStatus(deviceId);
    
    if (!status.is_active || !status.features || status.features[featureCode] === undefined) {
      return {
        device_id: deviceId,
        feature_code: featureCode,
        has_feature: false,
        value: null,
        plan_code: status.is_active ? status.plan.code : null,
      };
    }

    return {
      device_id: deviceId,
      feature_code: featureCode,
      has_feature: true,
      value: status.features[featureCode],
      plan_code: status.plan.code,
    };
  }

  async requireDeviceFeature(deviceId: number, featureCode: string): Promise<any> {
    const result = await this.deviceHasFeature(deviceId, featureCode);
    if (!result.has_feature) {
      throw new ForbiddenException('Premium feature required');
    }
    return result;
  }

  async manualActivateSubscription(userId: number, dto: ManualActivateSubscriptionDto): Promise<any> {
    const device = await this.validateUserDeviceAccess(userId, dto.device_id);

    const plan = await this.planRepository.findOne({ where: { code: dto.plan_code, is_active: true } });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    let subscription = await this.deviceSubscriptionRepository.createQueryBuilder('ds')
      .where('ds.device_id = :deviceId', { deviceId: dto.device_id })
      .andWhere('ds.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .getOne();

    const now = new Date();
    const endDate = new Date();
    const months = dto.months || 1;
    endDate.setMonth(endDate.getMonth() + months);

    if (subscription) {
      subscription.plan_id = plan.id;
      subscription.current_period_end = endDate;
      subscription.status = 'active';
      subscription.cancel_at_period_end = false;
      subscription.canceled_at = null;
      subscription.updated_at = now;
      await this.deviceSubscriptionRepository.save(subscription);
    } else {
      subscription = this.deviceSubscriptionRepository.create({
        device_id: dto.device_id,
        user_id: userId,
        plan_id: plan.id,
        provider: 'manual',
        status: 'active',
        started_at: now,
        current_period_start: now,
        current_period_end: endDate,
        cancel_at_period_end: false,
      });
      subscription = await this.deviceSubscriptionRepository.save(subscription);
    }

    const event = this.eventRepository.create({
      device_subscription_id: subscription.id,
      device_id: dto.device_id,
      user_id: userId,
      plan_id: plan.id,
      provider: 'manual',
      event_type: 'manual_subscription_activated',
      raw_payload: dto,
    });
    await this.eventRepository.save(event);

    return {
      success: true,
      message: 'Subscription activated manually',
      device_id: dto.device_id,
      plan_code: dto.plan_code,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
    };
  }

  async manualCancelSubscription(userId: number, dto: ManualCancelSubscriptionDto): Promise<any> {
    await this.validateUserDeviceAccess(userId, dto.device_id);

    const subscription = await this.deviceSubscriptionRepository.createQueryBuilder('ds')
      .where('ds.device_id = :deviceId', { deviceId: dto.device_id })
      .andWhere('ds.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .getOne();

    if (!subscription) {
      throw new NotFoundException('Active subscription not found');
    }

    const now = new Date();
    const cancelAtEnd = dto.cancel_at_period_end || false;

    if (cancelAtEnd) {
      subscription.cancel_at_period_end = true;
      await this.deviceSubscriptionRepository.save(subscription);

      const event = this.eventRepository.create({
        device_subscription_id: subscription.id,
        device_id: dto.device_id,
        user_id: userId,
        plan_id: subscription.plan_id,
        provider: 'manual',
        event_type: 'manual_subscription_cancel_at_period_end',
        raw_payload: dto,
      });
      await this.eventRepository.save(event);
    } else {
      subscription.status = 'canceled';
      subscription.canceled_at = now;
      subscription.current_period_end = now;
      subscription.cancel_at_period_end = false;
      await this.deviceSubscriptionRepository.save(subscription);

      const event = this.eventRepository.create({
        device_subscription_id: subscription.id,
        device_id: dto.device_id,
        user_id: userId,
        plan_id: subscription.plan_id,
        provider: 'manual',
        event_type: 'manual_subscription_canceled',
        raw_payload: dto,
      });
      await this.eventRepository.save(event);
    }

    return {
      success: true,
      message: 'Subscription canceled manually',
      device_id: dto.device_id,
      status: subscription.status,
    };
  }

  private async getGooglePlaySubscription(token: string) {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    const clientEmail = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!packageName || (!clientEmail && !process.env.GOOGLE_APPLICATION_CREDENTIALS) || (!privateKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      throw new InternalServerErrorException('Google Play credentials not configured');
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });

      const androidPublisher = google.androidpublisher({
        version: 'v3',
        auth: auth,
      });

      const response = await androidPublisher.purchases.subscriptionsv2.get({
        packageName: packageName,
        token: token,
      });

      return response.data;
    } catch (error) {
      console.error('Google Play API Error:', error.message);
      throw new InternalServerErrorException('Google Play verification failed');
    }
  }

  async verifyGooglePlayPurchase(userId: number, dto: GooglePlayVerifyDto): Promise<any> {
    await this.validateUserDeviceAccess(userId, dto.device_id);

    const productToPlanMap: { [key: string]: string } = {
      flueguard_plus_monthly: 'plus',
      flueguard_pro_monthly: 'pro',
      flueguard_business_monthly: 'business',
    };

    const planCode = productToPlanMap[dto.product_id];
    if (!planCode) {
      throw new BadRequestException('Invalid Google Play product_id');
    }

    const plan = await this.planRepository.findOne({ where: { code: planCode, is_active: true } });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    // Check if token is used by another device
    const existingWithToken = await this.deviceSubscriptionRepository.findOne({
      where: { provider: 'google_play', provider_purchase_token: dto.purchase_token }
    });

    if (existingWithToken && existingWithToken.device_id !== dto.device_id) {
      throw new ConflictException('This Google Play subscription is already linked to another device');
    }

    const googleData = await this.getGooglePlaySubscription(dto.purchase_token);
    
    // Log info for debugging
    console.log(`[Google Play] device_id=${dto.device_id} product_id=${dto.product_id} state=${googleData.subscriptionState} order=${googleData.latestOrderId}`);

    const activeStates = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'];
    
    if (!activeStates.includes(googleData.subscriptionState || '')) {
      const event = this.eventRepository.create({
        device_id: dto.device_id,
        user_id: userId,
        plan_id: plan.id,
        provider: 'google_play',
        event_type: 'google_play_verification_rejected',
        raw_payload: {
          product_id: dto.product_id,
          purchase_id: dto.purchase_id,
          subscriptionState: googleData.subscriptionState,
          latestOrderId: googleData.latestOrderId,
        },
      });
      await this.eventRepository.save(event);

      throw new BadRequestException('Google Play subscription is not active');
    }

    // Validar product_id
    const lineItem = googleData.lineItems?.find(item => item.productId === dto.product_id) || googleData.lineItems?.[0];
    if (!lineItem || lineItem.productId !== dto.product_id) {
      throw new BadRequestException('Google Play product_id does not match purchase token');
    }

    if (!lineItem.expiryTime) {
      throw new BadRequestException('Google Play subscription expiryTime not found');
    }

    const expiryTime = new Date(lineItem.expiryTime);
    const startTime = googleData.startTime ? new Date(googleData.startTime) : new Date();
    const latestOrderId = googleData.latestOrderId || dto.purchase_id || null;

    let subscription = await this.deviceSubscriptionRepository.findOne({
      where: { device_id: dto.device_id, provider: 'google_play' },
      order: { created_at: 'DESC' }
    });

    if (subscription) {
      subscription.plan_id = plan.id;
      subscription.user_id = userId;
      subscription.status = 'active';
      subscription.provider_product_id = dto.product_id;
      subscription.provider_subscription_id = latestOrderId;
      subscription.provider_purchase_token = dto.purchase_token;
      subscription.current_period_start = startTime;
      subscription.current_period_end = expiryTime;
      subscription.cancel_at_period_end = false;
      subscription.canceled_at = null;
      subscription.updated_at = new Date();
      await this.deviceSubscriptionRepository.save(subscription);
    } else {
      subscription = this.deviceSubscriptionRepository.create({
        device_id: dto.device_id,
        user_id: userId,
        plan_id: plan.id,
        status: 'active',
        provider: 'google_play',
        provider_product_id: dto.product_id,
        provider_subscription_id: latestOrderId,
        provider_purchase_token: dto.purchase_token,
        started_at: startTime,
        current_period_start: startTime,
        current_period_end: expiryTime,
        cancel_at_period_end: false,
        canceled_at: null,
      });
      subscription = await this.deviceSubscriptionRepository.save(subscription);
    }

    // TODO: acknowledge subscription purchase after successful backend validation if required by Google Play Billing flow.

    const event = this.eventRepository.create({
      device_subscription_id: subscription.id,
      device_id: dto.device_id,
      user_id: userId,
      plan_id: plan.id,
      provider: 'google_play',
      provider_event_id: latestOrderId,
      event_type: 'google_play_subscription_verified',
      raw_payload: {
        product_id: dto.product_id,
        purchase_id: dto.purchase_id,
        subscriptionState: googleData.subscriptionState,
        latestOrderId: googleData.latestOrderId,
        expiryTime: lineItem.expiryTime,
        lineItems: googleData.lineItems,
      },
    });
    await this.eventRepository.save(event);

    return this.getDeviceSubscriptionStatus(dto.device_id, userId);
  }
}
