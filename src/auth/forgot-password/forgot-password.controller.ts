import { Controller, Post, Body } from '@nestjs/common';
import { ForgotPasswordService } from './forgot-password.service';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth/forgot-password')
export class ForgotPasswordController {
  constructor(private readonly forgotPasswordService: ForgotPasswordService) {}

  @Post('request')
  async request(@Body() dto: ForgotPasswordRequestDto) {
    return this.forgotPasswordService.requestPasswordReset(dto);
  }

  @Post('verify-code')
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.forgotPasswordService.verifyCode(dto);
  }

  @Post('reset')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.forgotPasswordService.resetPassword(dto);
  }
}
