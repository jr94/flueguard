import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
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

const GOOGLE_PLAY_NOTIFICATION_TYPES: { [key: number]: string } = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
  20: 'SUBSCRIPTION_PENDING_PURCHASE_CANCELED',
};

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
      // Usar require en lugar de import estático para evitar que TypeScript compile todas las definiciones 
      // masivas de googleapis, lo que causa el error "JavaScript heap out of memory" durante el build en servidores con poca RAM.
      const { google } = require('googleapis');

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

  private validateRtdnSecret(querySecret?: string, headerSecret?: string) {
    const expectedSecret = process.env.GOOGLE_PLAY_RTDN_SECRET;
    if (!expectedSecret) {
      console.warn('GOOGLE_PLAY_RTDN_SECRET is not set in environment variables');
      throw new UnauthorizedException('Invalid RTDN secret');
    }
    if (querySecret !== expectedSecret && headerSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid RTDN secret');
    }
  }

  private decodePubSubMessage(body: any): any {
    if (!body?.message?.data) {
      return null;
    }
    try {
      const buffer = Buffer.from(body.message.data, 'base64');
      return JSON.parse(buffer.toString('utf-8'));
    } catch (error) {
      console.error('Error decoding PubSub message:', error);
      return null;
    }
  }

  private getNotificationTypeName(type: number): string {
    return GOOGLE_PLAY_NOTIFICATION_TYPES[type] || `UNKNOWN_${type}`;
  }

  async handleGooglePlayRtdn(params: {
    body: any;
    querySecret?: string;
    headerSecret?: string;
  }) {
    // 1. Validar secret
    this.validateRtdnSecret(params.querySecret, params.headerSecret);

    // 2 & 3 & 4. Validar y decodificar data base64
    const decoded = this.decodePubSubMessage(params.body);
    if (!decoded) {
      throw new BadRequestException('Invalid Pub/Sub message data');
    }

    const messageId = params.body?.message?.messageId;
    const publishTime = params.body?.message?.publishTime;

    // 5. Validar packageName
    if (decoded.packageName && decoded.packageName !== process.env.GOOGLE_PLAY_PACKAGE_NAME) {
      console.warn(`[RTDN] Ignored message for package: ${decoded.packageName}`);
      return { success: true, message: 'Ignored unknown package' };
    }

    // 6. Si viene testNotification
    if (decoded.testNotification) {
      const event = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_rtdn_test',
        raw_payload: { decoded, pubsub: params.body },
      });
      await this.eventRepository.save(event);
      return { success: true, type: 'testNotification' };
    }

    // 7. Si no viene subscriptionNotification
    if (!decoded.subscriptionNotification) {
      const event = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_rtdn_ignored',
        raw_payload: { decoded, pubsub: params.body },
      });
      await this.eventRepository.save(event);
      return { success: true, message: 'Ignored non-subscription notification' };
    }

    // 8. Extraer datos
    const notification = decoded.subscriptionNotification;
    const purchaseToken = notification.purchaseToken;
    const subscriptionId = notification.subscriptionId;
    const notificationType = notification.notificationType;
    const notificationName = this.getNotificationTypeName(notificationType);
    
    // Log útil
    const partialToken = purchaseToken ? `${purchaseToken.substring(0, 6)}...${purchaseToken.substring(purchaseToken.length - 6)}` : 'null';
    console.log(`[RTDN] Received ${notificationName} for sub ${subscriptionId}, token ${partialToken}, msgId ${messageId}`);

    // 9. Buscar en device_subscriptions
    const subscription = await this.deviceSubscriptionRepository.findOne({
      where: { provider: 'google_play', provider_purchase_token: purchaseToken },
      order: { id: 'DESC' }
    });

    // 10. Si no existe device_subscription
    if (!subscription) {
      console.warn(`[RTDN] No active subscription found for token ${partialToken}`);
      const event = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_rtdn_unmatched',
        provider_event_id: messageId,
        raw_payload: { decoded, pubsub: params.body },
      });
      await this.eventRepository.save(event);
      return { success: true, event: notificationName, matched: false };
    }

    // 11. Consultar Google Play Developer API
    let googleData;
    try {
      googleData = await this.getGooglePlaySubscription(purchaseToken);
    } catch (error) {
      console.error(`[RTDN] Google API error for token ${partialToken}:`, error.message);
      // Responder 500 para que Pub/Sub reintente si es error de red
      throw new InternalServerErrorException('Error verifying subscription with Google Play');
    }

    // 12. Actualizar device_subscriptions
    const lineItem = googleData.lineItems?.find((item: any) => item.productId === subscriptionId) || googleData.lineItems?.[0];
    const expiryTimeDate = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
    const startTimeDate = googleData.startTime ? new Date(googleData.startTime) : null;
    const now = new Date();

    let status = subscription.status;
    let current_period_end = subscription.current_period_end;
    let cancel_at_period_end = subscription.cancel_at_period_end;
    let canceled_at = subscription.canceled_at;

    // Actualizar current_period_end si existe en Google
    if (expiryTimeDate) {
      current_period_end = expiryTimeDate;
    }

    // Mapeo de subscriptionState a status interno
    switch (googleData.subscriptionState) {
      case 'SUBSCRIPTION_STATE_ACTIVE':
      case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
        status = 'active';
        cancel_at_period_end = false;
        canceled_at = null; 
        break;
      case 'SUBSCRIPTION_STATE_ON_HOLD':
      case 'SUBSCRIPTION_STATE_PAUSED':
      case 'SUBSCRIPTION_STATE_PENDING':
        status = 'past_due';
        cancel_at_period_end = false;
        break;
      case 'SUBSCRIPTION_STATE_CANCELED':
        if (expiryTimeDate && expiryTimeDate > now) {
          status = 'active';
          cancel_at_period_end = true;
          canceled_at = canceled_at || now;
        } else {
          status = 'canceled';
          current_period_end = expiryTimeDate || now;
          cancel_at_period_end = false;
          canceled_at = canceled_at || now;
        }
        break;
      case 'SUBSCRIPTION_STATE_EXPIRED':
        status = 'expired';
        current_period_end = expiryTimeDate || now;
        cancel_at_period_end = false;
        canceled_at = canceled_at || now;
        break;
      default:
        break;
    }

    // notificationType forzar algunos estados
    if (notificationType === 12) { // SUBSCRIPTION_REVOKED
      status = 'canceled';
      current_period_end = now;
      cancel_at_period_end = false;
      canceled_at = now;
    } else if (notificationType === 13) { // SUBSCRIPTION_EXPIRED
      status = 'expired';
      current_period_end = expiryTimeDate || now;
      cancel_at_period_end = false;
    } else if (notificationType === 5) { // SUBSCRIPTION_ON_HOLD
      status = 'past_due';
    } else if (notificationType === 6) { // SUBSCRIPTION_IN_GRACE_PERIOD
      status = 'active';
    } else if (notificationType === 2) { // SUBSCRIPTION_RENEWED
      status = 'active';
      cancel_at_period_end = false;
      canceled_at = null;
    } else if (notificationType === 3) { // SUBSCRIPTION_CANCELED
      if (current_period_end && current_period_end > now) {
        status = 'active';
        cancel_at_period_end = true;
        canceled_at = canceled_at || now;
      } else {
        status = 'canceled';
        canceled_at = canceled_at || now;
      }
    }

    // Actualizar plan_id si cambia
    const productToPlanMap: { [key: string]: string } = {
      flueguard_plus_monthly: 'plus',
      flueguard_pro_monthly: 'pro',
    };
    let newPlanId = subscription.plan_id;
    if (subscriptionId && productToPlanMap[subscriptionId]) {
      const planCode = productToPlanMap[subscriptionId];
      const plan = await this.planRepository.findOne({ where: { code: planCode } });
      if (plan) {
        newPlanId = plan.id;
      }
    }

    subscription.status = status;
    subscription.plan_id = newPlanId;
    subscription.provider_product_id = subscriptionId || subscription.provider_product_id;
    subscription.provider_subscription_id = googleData.latestOrderId || subscription.provider_subscription_id;
    subscription.current_period_start = startTimeDate || subscription.current_period_start;
    subscription.current_period_end = current_period_end;
    subscription.cancel_at_period_end = cancel_at_period_end;
    subscription.canceled_at = canceled_at;
    subscription.updated_at = now;

    await this.deviceSubscriptionRepository.save(subscription);

    // Guardar evento
    const event = this.eventRepository.create({
      device_subscription_id: subscription.id,
      device_id: subscription.device_id,
      user_id: subscription.user_id,
      plan_id: subscription.plan_id,
      provider: 'google_play',
      event_type: 'google_play_rtdn_' + notificationName.toLowerCase(),
      provider_event_id: messageId || googleData.latestOrderId,
      raw_payload: {
        pubsubMessageId: messageId,
        publishTime: publishTime,
        decoded: decoded,
        subscriptionState: googleData.subscriptionState,
        latestOrderId: googleData.latestOrderId,
        lineItems: googleData.lineItems,
        mappedStatus: status,
        expiryTime: lineItem?.expiryTime,
      },
    });
    await this.eventRepository.save(event);

    console.log(`[RTDN] Updated subscription ${subscription.id} to status ${status}`);

    return {
      success: true,
      event: notificationName,
      device_subscription_id: subscription.id,
      status: status,
    };
  }

  async shouldRunGooglePlayDailyRevalidation(): Promise<boolean> {
    const now = new Date();
    
    // Check if hour is between 03:00 and 03:30 in America/Santiago
    // To do this simply without complex tz libraries, we can format the date to Santiago timezone
    const santiagoTimeStr = now.toLocaleString('en-US', { timeZone: 'America/Santiago', hour12: false });
    const santiagoDate = new Date(santiagoTimeStr); // This is approximate depending on environment, better use Intl
    
    // Better way using Intl
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const hourStr = parts.find(p => p.type === 'hour')?.value;
    const minStr = parts.find(p => p.type === 'minute')?.value;
    
    const hour = parseInt(hourStr || '0', 10);
    const minute = parseInt(minStr || '0', 10);

    if (hour !== 3 || minute >= 30) {
      return false; // Not the time window (03:00 - 03:29)
    }

    // Determine start of the day in UTC that roughly corresponds to today in Santiago
    // For simplicity, let's just check the last 24 hours to prevent duplicate runs
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600000);

    const alreadyRan = await this.eventRepository.findOne({
      where: {
        provider: 'google_play',
        event_type: 'google_play_daily_revalidation_finished',
      },
      order: { created_at: 'DESC' }
    });

    if (alreadyRan && alreadyRan.created_at > twentyFourHoursAgo) {
      return false;
    }

    return true;
  }

  async revalidateGooglePlaySubscriptionsDaily(): Promise<{ checked: number; updated: number; errors: number; skipped: number; }> {
    console.log("Starting Google Play daily subscription revalidation");
    const result = { checked: 0, updated: 0, errors: 0, skipped: 0 };
    
    try {
      const subscriptionsToRevalidate = await this.deviceSubscriptionRepository.createQueryBuilder('ds')
        .where('ds.provider = :provider', { provider: 'google_play' })
        .andWhere('ds.provider_purchase_token IS NOT NULL')
        .andWhere('(ds.status IN (:...statuses) OR ds.cancel_at_period_end = true OR ds.current_period_end >= NOW())', {
          statuses: ['active', 'trialing', 'past_due'],
        })
        .getMany();

      console.log(`Found ${subscriptionsToRevalidate.length} Google Play subscriptions to revalidate`);

      for (const subscription of subscriptionsToRevalidate) {
        result.checked++;
        const token = subscription.provider_purchase_token;
        if (!token) continue;
        const partialToken = `${token.substring(0, 6)}...${token.substring(token.length - 6)}`;
        
        try {
          const googleData = await this.getGooglePlaySubscription(token);
          
          let lineItem = googleData.lineItems?.find((item: any) => item.productId === subscription.provider_product_id);
          if (!lineItem && googleData.lineItems?.length > 0) {
            lineItem = googleData.lineItems[0];
          }

          const expiryTimeDate = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
          const startTimeDate = googleData.startTime ? new Date(googleData.startTime) : null;
          const now = new Date();

          let status = subscription.status;
          let current_period_end = subscription.current_period_end;
          let cancel_at_period_end = subscription.cancel_at_period_end;
          let canceled_at = subscription.canceled_at;

          // Reglas de mapeo
          switch (googleData.subscriptionState) {
            case 'SUBSCRIPTION_STATE_ACTIVE':
              status = 'active';
              cancel_at_period_end = false;
              canceled_at = null;
              if (expiryTimeDate) current_period_end = expiryTimeDate;
              break;
            case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
              status = 'active';
              cancel_at_period_end = false;
              if (expiryTimeDate) current_period_end = expiryTimeDate;
              break;
            case 'SUBSCRIPTION_STATE_ON_HOLD':
              status = 'past_due';
              cancel_at_period_end = false;
              if (expiryTimeDate) current_period_end = expiryTimeDate;
              break;
            case 'SUBSCRIPTION_STATE_PAUSED':
              status = 'past_due';
              cancel_at_period_end = false;
              break;
            case 'SUBSCRIPTION_STATE_CANCELED':
              if (expiryTimeDate && expiryTimeDate > now) {
                status = 'active';
                cancel_at_period_end = true;
                canceled_at = canceled_at || now;
                current_period_end = expiryTimeDate;
              } else {
                status = 'canceled';
                cancel_at_period_end = false;
                canceled_at = canceled_at || now;
                current_period_end = expiryTimeDate || now;
              }
              break;
            case 'SUBSCRIPTION_STATE_EXPIRED':
              status = 'expired';
              cancel_at_period_end = false;
              canceled_at = canceled_at || now;
              current_period_end = expiryTimeDate || now;
              break;
            case 'SUBSCRIPTION_STATE_PENDING':
              status = 'past_due'; // o mantener
              cancel_at_period_end = false;
              break;
            default:
              // SUBSCRIPTION_STATE_UNSPECIFIED u otros
              break;
          }

          const previousStatus = subscription.status;
          const previousPeriodEnd = subscription.current_period_end;
          const previousCancelAtPeriodEnd = subscription.cancel_at_period_end;
          const previousCanceledAt = subscription.canceled_at;
          const previousProviderSubscriptionId = subscription.provider_subscription_id;

          const changedStatus = previousStatus !== status;
          const changedPeriodEnd = previousPeriodEnd?.getTime() !== current_period_end?.getTime();
          const changedCancelAtPeriodEnd = previousCancelAtPeriodEnd !== cancel_at_period_end;
          const changedCanceledAt = previousCanceledAt?.getTime() !== canceled_at?.getTime();
          const changedProviderSubscriptionId = previousProviderSubscriptionId !== googleData.latestOrderId && googleData.latestOrderId;

          const problematicStates = ['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_UNSPECIFIED'];
          const hasProblematicState = problematicStates.includes(googleData.subscriptionState || '');

          const changedAny = changedStatus || changedPeriodEnd || changedCancelAtPeriodEnd || changedCanceledAt || changedProviderSubscriptionId;

          console.log(`- Sub ${subscription.id} | Device ${subscription.device_id} | State: ${googleData.subscriptionState} | Mapped: ${status} | Changed: ${changedAny}`);

          if (changedAny) {
            subscription.status = status;
            if (lineItem?.productId) subscription.provider_product_id = lineItem.productId;
            if (googleData.latestOrderId) subscription.provider_subscription_id = googleData.latestOrderId;
            if (startTimeDate) subscription.current_period_start = startTimeDate;
            subscription.current_period_end = current_period_end;
            subscription.cancel_at_period_end = cancel_at_period_end;
            subscription.canceled_at = canceled_at;
            subscription.updated_at = now;

            await this.deviceSubscriptionRepository.save(subscription);
            result.updated++;
            
            const changedFields: string[] = [];
            if (changedStatus) changedFields.push('status');
            if (changedPeriodEnd) changedFields.push('current_period_end');
            if (changedCancelAtPeriodEnd) changedFields.push('cancel_at_period_end');
            if (changedCanceledAt) changedFields.push('canceled_at');
            if (changedProviderSubscriptionId) changedFields.push('provider_subscription_id');

            const event = this.eventRepository.create({
              device_subscription_id: subscription.id,
              device_id: subscription.device_id,
              user_id: subscription.user_id,
              plan_id: subscription.plan_id,
              provider: 'google_play',
              event_type: 'google_play_daily_revalidation',
              provider_event_id: googleData.latestOrderId || subscription.provider_subscription_id,
              raw_payload: {
                source: "daily_cron",
                subscriptionId: subscription.id,
                deviceId: subscription.device_id,
                previousStatus,
                newStatus: status,
                previousPeriodEnd,
                newPeriodEnd: current_period_end,
                previousCancelAtPeriodEnd,
                newCancelAtPeriodEnd: cancel_at_period_end,
                subscriptionState: googleData.subscriptionState,
                latestOrderId: googleData.latestOrderId,
                productId: lineItem?.productId,
                expiryTime: lineItem?.expiryTime,
                changedFields
              },
            });
            await this.eventRepository.save(event);
          } else if (hasProblematicState) {
            // Guardar evento aunque no cambie nada si es estado problemático
            const unhandledEvent = this.eventRepository.create({
              device_subscription_id: subscription.id,
              device_id: subscription.device_id,
              user_id: subscription.user_id,
              plan_id: subscription.plan_id,
              provider: 'google_play',
              event_type: 'google_play_daily_revalidation_unhandled_state',
              provider_event_id: googleData.latestOrderId || subscription.provider_subscription_id,
              raw_payload: {
                source: "daily_cron",
                subscriptionId: subscription.id,
                deviceId: subscription.device_id,
                subscriptionState: googleData.subscriptionState,
                latestOrderId: googleData.latestOrderId,
              },
            });
            await this.eventRepository.save(unhandledEvent);
            result.skipped++;
          } else {
            result.skipped++;
          }

        } catch (subError) {
          console.error(`Error revalidating subscription ${subscription.id} (token: ${partialToken}):`, subError.message);
          result.errors++;
          
          const errEvent = this.eventRepository.create({
            device_subscription_id: subscription.id,
            device_id: subscription.device_id,
            user_id: subscription.user_id,
            plan_id: subscription.plan_id,
            provider: 'google_play',
            event_type: 'google_play_daily_revalidation_error',
            raw_payload: {
              source: "daily_cron",
              subscriptionId: subscription.id,
              deviceId: subscription.device_id,
              error: subError.message,
              executedAt: new Date().toISOString(),
            },
          });
          await this.eventRepository.save(errEvent);
        }
      }

      // Final event summary
      const finishEvent = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_daily_revalidation_finished',
        raw_payload: {
          ...result,
          executedAt: new Date().toISOString()
        },
      });
      await this.eventRepository.save(finishEvent);

    } catch (error) {
      console.error('Fatal error during Google Play daily subscription revalidation:', error.message);
      
      const finishErrorEvent = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_daily_revalidation_failed',
        raw_payload: {
          error: error.message,
          executedAt: new Date().toISOString()
        },
      });
      await this.eventRepository.save(finishErrorEvent);
    }
    
    console.log("Google Play daily subscription revalidation finished", result);
    return result;
  }

  public isFeatureEnabled(value: any): boolean {
    if (value === null || value === undefined) return false;

    const normalized = String(value).trim().toLowerCase();

    if (
      normalized === '' ||
      normalized === 'false' ||
      normalized === '0' ||
      normalized === 'no' ||
      normalized === 'disabled'
    ) {
      return false;
    }

    return true;
  }

  async deviceHasActiveFeature(
    deviceId: number,
    featureCode: string,
  ): Promise<boolean> {
    const status = await this.getDeviceSubscriptionStatus(deviceId);

    if (!status.is_active || !status.features) {
      return false;
    }

    const featureValue = status.features[featureCode];
    return this.isFeatureEnabled(featureValue);
  }
}
