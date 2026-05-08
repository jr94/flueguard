import { Controller, Get, Post, Body, Param, UseGuards, Req, ParseIntPipe, Query, Headers } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { ManualActivateSubscriptionDto } from './dto/manual-activate-subscription.dto';
import { ManualCancelSubscriptionDto } from './dto/manual-cancel-subscription.dto';
import { GooglePlayVerifyDto } from './dto/google-play-verify.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('google-play/verify')
  async verifyGooglePlayPurchase(
    @Body() dto: GooglePlayVerifyDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.subscriptionsService.verifyGooglePlayPurchase(userId, dto);
  }

  @Post('google-play/rtdn')
  async handleGooglePlayRtdn(
    @Body() body: any,
    @Query('secret') querySecret: string,
    @Headers('x-rtdn-secret') headerSecret: string,
  ) {
    return this.subscriptionsService.handleGooglePlayRtdn({
      body,
      querySecret,
      headerSecret,
    });
  }

  @Post('google-play/revalidate')
  @UseGuards(JwtAuthGuard)
  async revalidateGooglePlaySubscriptions() {
    // TODO: restrict to admin
    const result = await this.subscriptionsService.revalidateGooglePlaySubscriptionsDaily();
    return {
      success: true,
      ...result,
    };
  }

  @Get('plans')
  async getActivePlans() {
    return this.subscriptionsService.getActivePlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('device/:deviceId')
  async getDeviceSubscriptionStatus(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.subscriptionsService.getDeviceSubscriptionStatus(deviceId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user/:userId/next-product')
  async getNextAvailableGooglePlayProduct(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('plan') plan: string,
  ) {
    return this.subscriptionsService.getNextAvailableGooglePlayProduct(userId, plan);
  }

  @UseGuards(JwtAuthGuard)
  @Get('device/:deviceId/status')
  async getDeviceSubscriptionStatusV2(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const status = await this.subscriptionsService.getDeviceSubscriptionStatus(deviceId, userId);
    
    // Format response as requested by the user
    return {
      deviceId: status.device_id,
      hasActiveSubscription: status.is_active,
      planName: status.plan?.code || (status.is_active ? 'premium' : 'basic'),
      status: status.status === 'inactive' ? 'none' : status.status,
      currentPeriodEnd: status.current_period_end,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('device/:deviceId/features')
  async getDeviceFeatures(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.subscriptionsService.getDeviceFeatures(deviceId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('manual-activate')
  async manualActivateSubscription(
    @Body() dto: ManualActivateSubscriptionDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.subscriptionsService.manualActivateSubscription(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('manual-cancel')
  async manualCancelSubscription(
    @Body() dto: ManualCancelSubscriptionDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.subscriptionsService.manualCancelSubscription(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('device/:deviceId/has-feature/:featureCode')
  async deviceHasFeature(
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('featureCode') featureCode: string,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    await this.subscriptionsService.validateUserDeviceAccess(userId, deviceId);
    return this.subscriptionsService.deviceHasFeature(deviceId, featureCode);
  }
}
