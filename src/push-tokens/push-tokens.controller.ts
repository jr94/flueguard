import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PushTokensService } from './push-tokens.service';
import { CreatePushTokenDto } from './dto/create-push-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly pushTokensService: PushTokensService) {}

  @Post()
  register(@Body() createPushTokenDto: CreatePushTokenDto) {
    return this.pushTokensService.registerToken(createPushTokenDto);
  }
}
