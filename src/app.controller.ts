import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import type { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('links')
  getLinksPage(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'links.html'));
  }
}
