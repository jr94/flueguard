import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanFeature } from './entities/subscription-plan-feature.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import { Device } from '../devices/entities/device.entity';
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

const GOOGLE_PLAY_PRODUCTS = {
  plus: [
    'flueguard_plus_device_1',
    'flueguard_plus_device_2',
    'flueguard_plus_device_3',
    'flueguard_plus_device_4',
    'flueguard_plus_device_5',
  ],
  pro: [
    'flueguard_pro_device_1',
    'flueguard_pro_device_2',
    'flueguard_pro_device_3',
    'flueguard_pro_device_4',
    'flueguard_pro_device_5',
  ],
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(SubscriptionPlanFeature)
    private readonly featureRepository: Repository<SubscriptionPlanFeature>,
    @InjectRepository(UserSubscription)
    private readonly userSubscriptionRepository: Repository<UserSubscription>,
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

  async getOwnerUserIdByDeviceId(deviceId: number): Promise<number | null> {
    const link = await this.deviceRepository.createQueryBuilder('device')
      .innerJoin('user_devices', 'ud', 'ud.device_id = device.id')
      .select('ud.user_id', 'user_id')
      .where('device.id = :deviceId', { deviceId })
      .andWhere('ud.owner = 1')
      .getRawOne();
    return link ? Number(link.user_id) : null;
  }

  // --- REQUIRED USER-BASED METHODS ---

  async getActiveSubscriptionByUserId(userId: number): Promise<UserSubscription | null> {
    return this.userSubscriptionRepository.createQueryBuilder('us')
      .innerJoinAndSelect('us.plan', 'sp')
      .leftJoinAndSelect('sp.features', 'spf')
      .where('us.user_id = :userId', { userId })
      .andWhere('us.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .andWhere('us.current_period_end > NOW()')
      .andWhere('sp.is_active = 1')
      .orderBy('us.current_period_end', 'DESC')
      .getOne();
  }

  async getEffectivePlanByUserId(userId: number): Promise<{ id: number | null, code: string, name: string }> {
    const subscription = await this.getActiveSubscriptionByUserId(userId);
    if (subscription && subscription.plan) {
      return {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
      };
    }
    return {
      id: null,
      code: 'basic',
      name: 'FlueGuard Básico',
    };
  }

  async getUserPlanFeatures(userId: number): Promise<any> {
    const subscription = await this.getActiveSubscriptionByUserId(userId);
    const featuresObj: any = {};
    let planCode = 'basic';
    let planName = 'FlueGuard Básico';

    if (subscription && subscription.plan) {
      planCode = subscription.plan.code;
      planName = subscription.plan.name;
      if (subscription.plan.features) {
        subscription.plan.features.forEach(f => {
          featuresObj[f.feature_code] = this.parseFeatureValue(f.feature_value);
        });
      }
    } else {
      const basicPlan = await this.planRepository.findOne({
        where: { code: 'basic', is_active: true },
        relations: ['features'],
      });
      if (basicPlan && basicPlan.features) {
        basicPlan.features.forEach(f => {
          featuresObj[f.feature_code] = this.parseFeatureValue(f.feature_value);
        });
      }
    }

    return {
      user_id: userId,
      is_active: !!subscription,
      plan_code: planCode,
      plan_name: planName,
      features: featuresObj,
    };
  }

  async getMySubscription(userId: number): Promise<any> {
    const subscription = await this.getActiveSubscriptionByUserId(userId);

    if (!subscription) {
      const basicPlan = await this.planRepository.findOne({
        where: { code: 'basic', is_active: true },
        relations: ['features'],
      });
      const featuresObj: any = {};
      if (basicPlan && basicPlan.features) {
        basicPlan.features.forEach(f => {
          featuresObj[f.feature_code] = this.parseFeatureValue(f.feature_value);
        });
      }

      return {
        user_id: userId,
        is_active: false,
        status: 'none',
        plan: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        features: featuresObj,
        provider: null,
        provider_product_id: null,
        provider_base_plan_id: null,
        provider_product_display_name: null,
        provider_product_slot: null,
        manage_subscription_url: null,
      };
    }

    const featuresObj: any = {};
    if (subscription.plan && subscription.plan.features) {
      subscription.plan.features.forEach(f => {
        featuresObj[f.feature_code] = this.parseFeatureValue(f.feature_value);
      });
    }

    const productInfo = this.getGooglePlayProductDisplayName(subscription.provider_product_id || '');
    const manageUrl = subscription.provider === 'google_play' && subscription.provider_product_id 
      ? this.buildGooglePlayManageSubscriptionUrl(subscription.provider_product_id) 
      : null;

    return {
      user_id: userId,
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
      provider: subscription.provider,
      provider_product_id: subscription.provider_product_id,
      provider_base_plan_id: subscription.provider_base_plan_id,
      provider_product_display_name: productInfo.displayName,
      provider_product_slot: productInfo.slotNumber,
      manage_subscription_url: manageUrl,
    };
  }

  async userHasFeature(userId: number, featureCode: string): Promise<any> {
    const featuresInfo = await this.getUserPlanFeatures(userId);
    const hasFeature = featuresInfo.features[featureCode] !== undefined && this.isFeatureEnabled(featuresInfo.features[featureCode]);
    return {
      user_id: userId,
      feature_code: featureCode,
      has_feature: hasFeature,
      value: featuresInfo.features[featureCode] ?? null,
      plan_code: featuresInfo.plan_code,
    };
  }

  async getEligibleNotificationUsersForFeature(deviceId: number, featureCode: string): Promise<number[]> {
    const userDevices = await this.deviceRepository.createQueryBuilder('device')
      .innerJoin('user_devices', 'ud', 'ud.device_id = device.id')
      .select('ud.user_id', 'user_id')
      .where('device.id = :deviceId', { deviceId })
      .andWhere('ud.notifications_enabled = 1')
      .getRawMany();

    const userIds = userDevices.map(ud => Number(ud.user_id));
    if (userIds.length === 0) return [];

    const eligibleUserIds: number[] = [];
    for (const userId of userIds) {
      const hasFeature = await this.userHasFeature(userId, featureCode);
      if (hasFeature.has_feature) {
        eligibleUserIds.push(userId);
      }
    }

    return eligibleUserIds;
  }

  async cancelUserSubscription(userId: number): Promise<any> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: { user_id: userId, status: In(['active', 'trialing', 'past_due']) }
    });
    if (!subscription) {
      throw new NotFoundException('No active subscription found to cancel');
    }
    subscription.status = 'canceled';
    subscription.canceled_at = new Date();
    subscription.updated_at = new Date();
    await this.userSubscriptionRepository.save(subscription);

    const event = this.eventRepository.create({
      user_subscription_id: subscription.id,
      user_id: userId,
      plan_id: subscription.plan_id,
      provider: subscription.provider,
      event_type: 'subscription_canceled',
      raw_payload: { cancelled_at: subscription.canceled_at },
    });
    await this.eventRepository.save(event);
    return { success: true, status: subscription.status };
  }

  async expireUserSubscription(userId: number): Promise<any> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: { user_id: userId, status: In(['active', 'trialing', 'past_due', 'canceled']) }
    });
    if (!subscription) {
      throw new NotFoundException('No active subscription found to expire');
    }
    subscription.status = 'expired';
    subscription.updated_at = new Date();
    await this.userSubscriptionRepository.save(subscription);

    const event = this.eventRepository.create({
      user_subscription_id: subscription.id,
      user_id: userId,
      plan_id: subscription.plan_id,
      provider: subscription.provider,
      event_type: 'subscription_expired',
      raw_payload: { expired_at: subscription.updated_at },
    });
    await this.eventRepository.save(event);
    return { success: true, status: subscription.status };
  }

  // --- GOOGLE PLAY INTEGRATION ---

  private async getGooglePlaySubscription(token: string) {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    const clientEmail = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!packageName || (!clientEmail && !process.env.GOOGLE_APPLICATION_CREDENTIALS) || (!privateKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      throw new InternalServerErrorException('Google Play credentials not configured');
    }

    try {
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
    } catch (error: any) {
      console.error('Google Play API Error:', error.message);
      throw new InternalServerErrorException('Google Play verification failed');
    }
  }

  async verifyGooglePlaySubscription(userId: number, dto: GooglePlayVerifyDto): Promise<any> {
    const payload = this.normalizeGooglePlayVerifyPayload(dto);
    
    // Diagnostic Logs
    const maskedToken = payload.providerPurchaseToken 
      ? `${payload.providerPurchaseToken.substring(0, 8)}...${payload.providerPurchaseToken.substring(payload.providerPurchaseToken.length - 8)}`
      : 'MISSING';
    
    console.log(`[Verify] Received payload:`, JSON.stringify({ ...dto, purchase_token: '***', purchaseToken: '***', providerPurchaseToken: '***' }));
    console.log(`[Verify] Normalized: productId=${payload.providerProductId}, token=${maskedToken}`);

    // Validaciones obligatorias
    if (!payload.providerProductId) throw new BadRequestException('providerProductId es obligatorio');
    if (!payload.providerPurchaseToken) throw new BadRequestException('providerPurchaseToken es obligatorio');

    // Detectar plan nuevo desde providerProductId
    let newPlanCode: string | null = null;
    const prodId = payload.providerProductId;

    if (prodId.startsWith('flueguard_plus_device_') || prodId === 'flueguard_plus_monthly') {
      newPlanCode = 'plus';
    } else if (prodId.startsWith('flueguard_pro_device_') || prodId === 'flueguard_pro_monthly') {
      newPlanCode = 'pro';
    } else if (prodId === 'flueguard_business_monthly') {
      newPlanCode = 'business';
    }

    if (!newPlanCode) throw new BadRequestException('Producto de Google Play no reconocido');

    const newPlan = await this.planRepository.findOne({ where: { code: newPlanCode, is_active: true } });
    if (!newPlan) throw new BadRequestException('Plan no configurado en base de datos');

    const PLAN_HIERARCHY: { [key: string]: number } = { 'basic': 0, 'plus': 1, 'pro': 2, 'business': 3 };
    const newPlanLevel = PLAN_HIERARCHY[newPlanCode] || 0;

    // Buscar suscripción activa actual del usuario
    const activeSub = await this.userSubscriptionRepository.findOne({
      where: { 
        user_id: userId, 
        status: In(['active', 'trialing', 'past_due']) 
      },
      relations: ['plan']
    });

    if (activeSub) {
      const currentPlanCode = activeSub.plan?.code || 'basic';
      const currentPlanLevel = PLAN_HIERARCHY[currentPlanCode] || 0;

      console.log(`[Verify] User ${userId} has active plan: ${currentPlanCode} (Level ${currentPlanLevel}). New plan: ${newPlanCode} (Level ${newPlanLevel})`);

      // Caso A: Mismo purchaseToken (Idempotencia)
      if (activeSub.provider_purchase_token === payload.providerPurchaseToken) {
        console.log(`[Verify] Same purchase token. Updating existing record.`);
      } else {
        // Caso B: Token distinto (Compra nueva o cambio de plan)
        if (newPlanLevel > currentPlanLevel) {
          // UPGRADE: Cerrar la anterior
          console.log(`[Verify] UPGRADE DETECTED. Closing old subscription ID ${activeSub.id}`);
          activeSub.status = 'canceled';
          activeSub.cancel_at_period_end = false;
          activeSub.canceled_at = new Date();
          activeSub.updated_at = new Date();
          await this.userSubscriptionRepository.save(activeSub);
        } else if (newPlanLevel === currentPlanLevel) {
          console.log(`[Verify] User already has active plan of same level. Updating existing record ID ${activeSub.id}`);
        } else {
          throw new ConflictException('No puedes cambiar a un plan inferior mientras el plan actual sigue activo');
        }
      }
    }

    // Call Google Play API
    const googleData = await this.getGooglePlaySubscription(payload.providerPurchaseToken);
    
    console.log(`[Google API] state=${googleData.subscriptionState}, latestOrder=${googleData.latestOrderId}`);

    const activeStates = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'];
    if (!activeStates.includes(googleData.subscriptionState || '')) {
      throw new BadRequestException(`La suscripción de Google Play no está activa (Estado: ${googleData.subscriptionState})`);
    }

    const lineItem = googleData.lineItems?.find(item => item.productId === payload.providerProductId) || googleData.lineItems?.[0];
    if (!lineItem || lineItem.productId !== payload.providerProductId) {
      throw new BadRequestException('El productId de Google Play no coincide con el token de compra');
    }

    const expiryTime = new Date(lineItem.expiryTime!);
    const startTime = googleData.startTime ? new Date(googleData.startTime) : new Date();
    const latestOrderId = googleData.latestOrderId || payload.providerOrderId || payload.providerSubscriptionId || null;

    // Buscar si ya existe la suscripción con este token específico (re-verificación)
    let subscription = await this.userSubscriptionRepository.findOne({
      where: { provider_purchase_token: payload.providerPurchaseToken }
    });

    if (subscription) {
      // Actualizar existente (Idempotente)
      subscription.plan_id = newPlan.id;
      subscription.user_id = userId;
      subscription.status = 'active';
      subscription.provider_product_id = payload.providerProductId;
      subscription.provider_subscription_id = latestOrderId;
      subscription.provider_base_plan_id = payload.providerBasePlanId || subscription.provider_base_plan_id;
      subscription.provider_order_id = payload.providerOrderId || subscription.provider_order_id || latestOrderId;
      subscription.current_period_start = startTime;
      subscription.current_period_end = expiryTime;
      subscription.cancel_at_period_end = false;
      subscription.canceled_at = null;
      subscription.updated_at = new Date();
      await this.userSubscriptionRepository.save(subscription);
      console.log(`[Verify] Updated subscription ID ${subscription.id} (Idempotent)`);
    } else {
      // Si el usuario ya tiene una suscripción activa (como la que encontramos arriba), podemos reusarla y actualizarla
      const existingActive = await this.userSubscriptionRepository.findOne({
        where: { user_id: userId, status: In(['active', 'trialing', 'past_due']) }
      });

      if (existingActive) {
        subscription = existingActive;
        subscription.plan_id = newPlan.id;
        subscription.status = 'active';
        subscription.provider = 'google_play';
        subscription.provider_product_id = payload.providerProductId;
        subscription.provider_subscription_id = latestOrderId;
        subscription.provider_purchase_token = payload.providerPurchaseToken;
        subscription.provider_base_plan_id = payload.providerBasePlanId || null;
        subscription.provider_order_id = payload.providerOrderId || latestOrderId;
        subscription.started_at = startTime;
        subscription.current_period_start = startTime;
        subscription.current_period_end = expiryTime;
        subscription.cancel_at_period_end = false;
        subscription.canceled_at = null;
        subscription.updated_at = new Date();
        await this.userSubscriptionRepository.save(subscription);
        console.log(`[Verify] Updated user existing subscription ID ${subscription.id} to Google Play`);
      } else {
        // Crear nueva suscripción
        subscription = this.userSubscriptionRepository.create({
          user_id: userId,
          plan_id: newPlan.id,
          status: 'active',
          provider: 'google_play',
          provider_product_id: payload.providerProductId,
          provider_subscription_id: latestOrderId,
          provider_purchase_token: payload.providerPurchaseToken,
          provider_base_plan_id: payload.providerBasePlanId || null,
          provider_order_id: payload.providerOrderId || latestOrderId,
          started_at: startTime,
          current_period_start: startTime,
          current_period_end: expiryTime,
          cancel_at_period_end: false,
          canceled_at: null,
        });
        subscription = await this.userSubscriptionRepository.save(subscription);
        console.log(`[Verify] Created new user subscription ID ${subscription.id} for plan ${newPlanCode}`);
      }
    }

    const event = this.eventRepository.create({
      user_subscription_id: subscription.id,
      user_id: userId,
      plan_id: newPlan.id,
      provider: 'google_play',
      provider_event_id: latestOrderId,
      event_type: 'google_play_subscription_verified',
      raw_payload: { product_id: payload.providerProductId, latestOrderId, expiryTime: lineItem.expiryTime },
    });
    await this.eventRepository.save(event);

    return this.getUserPlanFeatures(userId);
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
    this.validateRtdnSecret(params.querySecret, params.headerSecret);

    const decoded = this.decodePubSubMessage(params.body);
    if (!decoded) {
      throw new BadRequestException('Invalid Pub/Sub message data');
    }

    const messageId = params.body?.message?.messageId;
    const publishTime = params.body?.message?.publishTime;

    if (decoded.packageName && decoded.packageName !== process.env.GOOGLE_PLAY_PACKAGE_NAME) {
      console.warn(`[RTDN] Ignored message for package: ${decoded.packageName}`);
      return { success: true, message: 'Ignored unknown package' };
    }

    if (decoded.testNotification) {
      const event = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_rtdn_test',
        raw_payload: { decoded, pubsub: params.body },
      });
      await this.eventRepository.save(event);
      return { success: true, type: 'testNotification' };
    }

    if (!decoded.subscriptionNotification) {
      const event = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_rtdn_ignored',
        raw_payload: { decoded, pubsub: params.body },
      });
      await this.eventRepository.save(event);
      return { success: true, message: 'Ignored non-subscription notification' };
    }

    const notification = decoded.subscriptionNotification;
    const purchaseToken = notification.purchaseToken;
    const subscriptionId = notification.subscriptionId;
    const notificationType = notification.notificationType;
    const notificationName = this.getNotificationTypeName(notificationType);
    
    const partialToken = purchaseToken ? `${purchaseToken.substring(0, 6)}...${purchaseToken.substring(purchaseToken.length - 6)}` : 'null';
    console.log(`[RTDN] Received ${notificationName} for sub ${subscriptionId}, token ${partialToken}, msgId ${messageId}`);

    const subscription = await this.userSubscriptionRepository.findOne({
      where: { provider: 'google_play', provider_purchase_token: purchaseToken },
      order: { id: 'DESC' }
    });

    if (!subscription) {
      console.warn(`[RTDN] No active user subscription found for token ${partialToken}`);
      const event = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_rtdn_unmatched',
        provider_event_id: messageId,
        raw_payload: { decoded, pubsub: params.body },
      });
      await this.eventRepository.save(event);
      return { success: true, event: notificationName, matched: false };
    }

    let googleData;
    try {
      googleData = await this.getGooglePlaySubscription(purchaseToken);
    } catch (error: any) {
      console.error(`[RTDN] Google API error for token ${partialToken}:`, error.message);
      throw new InternalServerErrorException('Error verifying subscription with Google Play');
    }

    const lineItem = googleData.lineItems?.find((item: any) => item.productId === subscriptionId) || googleData.lineItems?.[0];
    const expiryTimeDate = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
    const startTimeDate = googleData.startTime ? new Date(googleData.startTime) : null;
    const now = new Date();

    let status = subscription.status;
    let current_period_end = subscription.current_period_end;
    let cancel_at_period_end = subscription.cancel_at_period_end;
    let canceled_at = subscription.canceled_at;

    if (expiryTimeDate) {
      current_period_end = expiryTimeDate;
    }

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

    await this.userSubscriptionRepository.save(subscription);

    const event = this.eventRepository.create({
      user_subscription_id: subscription.id,
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
      user_subscription_id: subscription.id,
      status: status,
    };
  }

  async shouldRunGooglePlayDailyRevalidation(): Promise<boolean> {
    const now = new Date();
    
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
      return false;
    }

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
      const subscriptionsToRevalidate = await this.userSubscriptionRepository.createQueryBuilder('us')
        .where('us.provider = :provider', { provider: 'google_play' })
        .andWhere('us.provider_purchase_token IS NOT NULL')
        .andWhere('(us.status IN (:...statuses) OR us.cancel_at_period_end = true OR us.current_period_end >= NOW())', {
          statuses: ['active', 'trialing', 'past_due'],
        })
        .getMany();

      console.log(`Found ${subscriptionsToRevalidate.length} Google Play user subscriptions to revalidate`);

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
              status = 'past_due';
              cancel_at_period_end = false;
              break;
            default:
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

          console.log(`- Sub ${subscription.id} | User ${subscription.user_id} | State: ${googleData.subscriptionState} | Mapped: ${status} | Changed: ${changedAny}`);

          if (changedAny) {
            subscription.status = status;
            if (lineItem?.productId) subscription.provider_product_id = lineItem.productId;
            if (googleData.latestOrderId) subscription.provider_subscription_id = googleData.latestOrderId;
            if (startTimeDate) subscription.current_period_start = startTimeDate;
            subscription.current_period_end = current_period_end;
            subscription.cancel_at_period_end = cancel_at_period_end;
            subscription.canceled_at = canceled_at;
            subscription.updated_at = now;

            await this.userSubscriptionRepository.save(subscription);
            result.updated++;
            
            const changedFields: string[] = [];
            if (changedStatus) changedFields.push('status');
            if (changedPeriodEnd) changedFields.push('current_period_end');
            if (changedCancelAtPeriodEnd) changedFields.push('cancel_at_period_end');
            if (changedCanceledAt) changedFields.push('canceled_at');
            if (changedProviderSubscriptionId) changedFields.push('provider_subscription_id');

            const event = this.eventRepository.create({
              user_subscription_id: subscription.id,
              user_id: subscription.user_id,
              plan_id: subscription.plan_id,
              provider: 'google_play',
              event_type: 'google_play_daily_revalidation',
              provider_event_id: googleData.latestOrderId || subscription.provider_subscription_id,
              raw_payload: {
                source: "daily_cron",
                subscriptionId: subscription.id,
                userId: subscription.user_id,
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
            const unhandledEvent = this.eventRepository.create({
              user_subscription_id: subscription.id,
              user_id: subscription.user_id,
              plan_id: subscription.plan_id,
              provider: 'google_play',
              event_type: 'google_play_daily_revalidation_unhandled_state',
              provider_event_id: googleData.latestOrderId || subscription.provider_subscription_id,
              raw_payload: {
                source: "daily_cron",
                subscriptionId: subscription.id,
                userId: subscription.user_id,
                subscriptionState: googleData.subscriptionState,
                latestOrderId: googleData.latestOrderId,
              },
            });
            await this.eventRepository.save(unhandledEvent);
            result.skipped++;
          } else {
            result.skipped++;
          }

        } catch (subError: any) {
          console.error(`Error revalidating subscription ${subscription.id} (token: ${partialToken}):`, subError.message);
          result.errors++;
          
          const errEvent = this.eventRepository.create({
            user_subscription_id: subscription.id,
            user_id: subscription.user_id,
            plan_id: subscription.plan_id,
            provider: 'google_play',
            event_type: 'google_play_daily_revalidation_error',
            raw_payload: {
              source: "daily_cron",
              subscriptionId: subscription.id,
              userId: subscription.user_id,
              error: subError.message,
              executedAt: new Date().toISOString(),
            },
          });
          await this.eventRepository.save(errEvent);
        }
      }

      const finishEvent = this.eventRepository.create({
        provider: 'google_play',
        event_type: 'google_play_daily_revalidation_finished',
        raw_payload: {
          ...result,
          executedAt: new Date().toISOString()
        },
      });
      await this.eventRepository.save(finishEvent);

    } catch (error: any) {
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

  async getProUserIds(): Promise<number[]> {
    const activeProSubs = await this.userSubscriptionRepository.createQueryBuilder('us')
      .innerJoin('us.plan', 'sp')
      .select('us.user_id', 'user_id')
      .where('us.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .andWhere('us.current_period_end > NOW()')
      .andWhere('sp.code = :planCode', { planCode: 'pro' })
      .getRawMany();
    return activeProSubs.map(s => Number(s.user_id));
  }

  async getDevicesForProUsers(): Promise<number[]> {
    const proUserIds = await this.getProUserIds();
    if (proUserIds.length === 0) return [];

    const devices = await this.deviceRepository.createQueryBuilder('device')
      .innerJoin('user_devices', 'ud', 'ud.device_id = device.id')
      .select('device.id', 'device_id')
      .where('ud.user_id IN (:...proUserIds)', { proUserIds })
      .andWhere('ud.owner = 1')
      .getRawMany();

    return devices.map(d => Number(d.device_id));
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

  private buildGooglePlayManageSubscriptionUrl(providerProductId: string): string {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'cl.flueguard.app';
    return `https://play.google.com/store/account/subscriptions?sku=${providerProductId}&package=${packageName}`;
  }

  private getGooglePlayProductDisplayName(providerProductId: string): {
    planCode: string;
    slotNumber: number | null;
    displayName: string | null;
  } {
    if (!providerProductId) {
      return { planCode: 'basic', slotNumber: null, displayName: 'Básico' };
    }

    const match = providerProductId.match(/flueguard_(plus|pro)_device_(\d+)/);
    if (match) {
      const planCode = match[1];
      const slotNumber = parseInt(match[2], 10);
      const planName = planCode === 'plus' ? 'Plus' : 'Pro';
      return {
        planCode,
        slotNumber,
        displayName: `FlueGuard ${planName} ${slotNumber}`,
      };
    }

    if (providerProductId === 'flueguard_plus_monthly') {
      return { planCode: 'plus', slotNumber: null, displayName: 'FlueGuard Plus' };
    }
    if (providerProductId === 'flueguard_pro_monthly') {
      return { planCode: 'pro', slotNumber: null, displayName: 'FlueGuard Pro' };
    }

    return { planCode: 'premium', slotNumber: null, displayName: providerProductId };
  }

  private normalizeGooglePlayVerifyPayload(dto: GooglePlayVerifyDto) {
    const normalized = {
      deviceId: dto.deviceId ?? dto.device_id,
      providerProductId: dto.providerProductId ?? dto.provider_product_id ?? dto.productId ?? dto.product_id,
      providerPurchaseToken: dto.providerPurchaseToken ?? dto.provider_purchase_token ?? dto.purchaseToken ?? dto.purchase_token,
      providerSubscriptionId: dto.providerSubscriptionId ?? dto.provider_subscription_id ?? dto.purchaseId ?? dto.purchase_id ?? dto.orderId ?? dto.order_id ?? dto.providerOrderId ?? dto.provider_order_id,
      providerBasePlanId: dto.providerBasePlanId ?? dto.provider_base_plan_id ?? dto.basePlanId ?? dto.base_plan_id,
      providerOrderId: dto.providerOrderId ?? dto.provider_order_id ?? dto.orderId ?? dto.order_id ?? dto.purchaseId ?? dto.purchase_id,
    };

    return normalized;
  }
}
