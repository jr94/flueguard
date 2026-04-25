import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

@Controller('delete-account')
export class DeleteAccountPageController {
  @Get()
  getDeleteAccountPage(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'delete-account.html'));
  }

  @Get('confirm')
  getDeleteAccountConfirmPage(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'delete-account-confirm.html'));
  }
}
