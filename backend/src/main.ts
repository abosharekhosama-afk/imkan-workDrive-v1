import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const http = app.getHttpAdapter().getInstance();
  http.use(express.json({ limit: '50mb' }));
  http.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
