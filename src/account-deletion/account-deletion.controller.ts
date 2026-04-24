import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { RequestDeletionDto } from './dto/request-deletion.dto';
import { ConfirmDeletionDto } from './dto/confirm-deletion.dto';

// Si el proyecto usa ThrottlerModule, se recomienda agregar aquí rate limiting:
// import { SkipThrottle, Throttle } from '@nestjs/throttler';
// @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
@Controller('account-deletion')
export class AccountDeletionController {
  constructor(private readonly accountDeletionService: AccountDeletionService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestDeletion(@Body() requestDto: RequestDeletionDto) {
    await this.accountDeletionService.requestDeletion(requestDto.email);
    // Siempre retorna el mismo mensaje genérico para no exponer existencia del usuario
    return {
      success: true,
      message: 'Si el correo existe, recibirás un enlace para confirmar la eliminación de tu cuenta.',
    };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmDeletion(@Body() confirmDto: ConfirmDeletionDto) {
    await this.accountDeletionService.confirmDeletion(confirmDto.token);
    return {
      success: true,
      message: 'Tu cuenta ha sido eliminada correctamente.',
    };
  }
}
