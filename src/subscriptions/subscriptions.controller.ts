import { Controller, Get, Post, Body, UseGuards, Req, Query, Headers } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { GooglePlayVerifyDto } from './dto/google-play-verify.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getActivePlans() {
    return this.subscriptionsService.getActivePlans();
  }

  @UseGuards(JwtAuthGuard)
  @Post('google-play/verify')
  async verifyGooglePlaySubscription(
    @Body() dto: GooglePlayVerifyDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.subscriptionsService.verifyGooglePlaySubscription(userId, dto);
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMySubscription(@Req() req: any) {
    const userId = req.user.id;
    return this.subscriptionsService.getMySubscription(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/plan')
  async getMyPlan(@Req() req: any) {
    const userId = req.user.id;
    return this.subscriptionsService.getEffectivePlanByUserId(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/features')
  async getMyPlanFeatures(@Req() req: any) {
    const userId = req.user.id;
    return this.subscriptionsService.getUserPlanFeatures(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cancel')
  async cancelUserSubscription(@Req() req: any) {
    const userId = req.user.id;
    return this.subscriptionsService.cancelUserSubscription(userId);
  }
}
