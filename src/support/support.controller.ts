import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @UseGuards(JwtAuthGuard)
  @Post('contact')
  async contactSupport(
    @Request() req,
    @Body() createSupportRequestDto: CreateSupportRequestDto,
  ) {
    const userId = req.user.id;
    return this.supportService.sendSupportRequest(userId, createSupportRequestDto);
  }
}
