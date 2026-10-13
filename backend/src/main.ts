import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import express from 'express';
import { createRateLimitMiddleware } from './common/rate-limit.middleware';
import { securityHeadersMiddleware } from './common/security-headers.middleware';

async function bootstrap() {
  // Fail fast on weak / missing JWT secret in production
  const jwtSecret = process.env.JWT_SECRET ?? '';
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd) {
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value (>= 32 chars) in production',
      );
    }
    if (
      jwtSecret.includes('dev_') ||
      jwtSecret === 'imkan-otp' ||
      jwtSecret.toLowerCase().includes('change')
    ) {
      throw new Error('JWT_SECRET appears to be a development placeholder; refuse to start in production');
    }
  } else if (!jwtSecret) {
    // eslint-disable-next-line no-console
    console.warn('[security] JWT_SECRET is not set — auth will fail until configured');
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const http = app.getHttpAdapter().getInstance();

  // When behind a reverse proxy (nginx, Render, Cloudflare), trust X-Forwarded-For
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true' || isProd) {
    http.set('trust proxy', 1);
  }

  // Security headers on every response
  http.use(securityHeadersMiddleware);

  // Rate limiting (auth stricter, bulk download limited, global soft cap)
  http.use(createRateLimitMiddleware());

  // Body parsers — keep a reasonable JSON limit; large file uploads use dedicated multipart routes
  const jsonLimit = process.env.JSON_BODY_LIMIT || '2mb';
  http.use(express.json({ limit: jsonLimit }));
  http.use(express.urlencoded({ limit: jsonLimit, extended: true }));

  // CORS: prefer explicit allow-list in production
  const corsOriginsEnv = process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || '';
  const corsOrigins = corsOriginsEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (isProd && corsOrigins.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[security] CORS_ORIGINS / FRONTEND_ORIGIN is empty in production — reflecting any Origin is disabled; set an allow-list',
    );
  }

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : isProd ? false : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 600,
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
