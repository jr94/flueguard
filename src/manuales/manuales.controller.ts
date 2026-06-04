import { Controller, Get, Res, InternalServerErrorException } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('manuales')
export class ManualesController {
  private getFilePath(filename: string): string {
    const paths = [
      join(process.cwd(), 'public', 'manuales', filename),
      join(process.cwd(), 'dist', 'public', 'manuales', filename),
      join(__dirname, '..', '..', 'public', 'manuales', filename),
      join(__dirname, '..', 'public', 'manuales', filename),
    ];

    for (const p of paths) {
      if (existsSync(p)) {
        return p;
      }
    }

    // Default fallback
    return paths[0];
  }

  private serveFile(filename: string, res: Response) {
    const filePath = this.getFilePath(filename);
    
    if (!existsSync(filePath)) {
      throw new InternalServerErrorException(
        `File not found: ${filename}. Checked paths: ` +
        `[1] ${join(process.cwd(), 'public', 'manuales', filename)}, ` +
        `[2] ${join(__dirname, '..', '..', 'public', 'manuales', filename)}`
      );
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).send(`Error serving ${filename}: ${err.message}`);
        }
      }
    });
  }

  @Get()
  getDocumentationCenter(@Res() res: Response) {
    this.serveFile('index.html', res);
  }

  @Get('inicio-rapido')
  getQuickStart(@Res() res: Response) {
    this.serveFile('inicio-rapido.html', res);
  }

  @Get('manual-usuario')
  getUserManual(@Res() res: Response) {
    this.serveFile('manual-usuario.html', res);
  }

  @Get('garantia')
  getWarranty(@Res() res: Response) {
    this.serveFile('garantia.html', res);
  }
}
