import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeFirebaseAdmin } from './config/firebase-admin.config';

async function bootstrap() {
  initializeFirebaseAdmin();
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'firmware', method: RequestMethod.ALL },
      { path: 'firmware/(.*)', method: RequestMethod.ALL },
      { path: 'delete-account', method: RequestMethod.GET },
      { path: 'delete-account/confirm', method: RequestMethod.GET },
    ],
  });
  
  // Enable CORS for mobile app
  app.enableCors();

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
