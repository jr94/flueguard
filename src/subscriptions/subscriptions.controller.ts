import { Controller, Get, Post, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { ManualActivateSubscriptionDto } from './dto/manual-activate-subscription.dto';
import { ManualCancelSubscriptionDto } from './dto/manual-cancel-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

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
