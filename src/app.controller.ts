import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Hello World!';
  }

  @Get('links')
  getLinksPage(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'links.html'));
  }

  @Get('portal/device/:serial')
  getPortalDevicePage(@Res() res: Response) {
    const filePath = join(process.cwd(), 'public', 'portal', 'device', 'index.html');
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error serving device page:', err);
        res.status(500).send(err.message);
      }
    });
  }
}
