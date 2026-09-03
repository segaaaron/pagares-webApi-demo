import 'reflect-metadata';
// Primero de todo: pone el `.env` de desarrollo en `process.env` antes de que
// cualquier módulo lea una variable al importarse.
import './config/load-env-file.js';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // `rawBody`: el webhook de entregas firma el cuerpo tal cual llega, y
  // reserializar el JSON invalidaría el HMAC (§16).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  /*
   * Detrás de un proxy inverso, `request.ip` es la del proxy salvo que se diga
   * cuántos saltos hay. Sin esto, el límite de tasa se reparte entre todos los
   * usuarios de la instalación y la bitácora anota siempre la misma IP, que es
   * como perder la mitad del valor de la auditoría (§9.3, §25.7).
   */
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks(); // drena la cola antes de morir (§6)

  await app.listen(env.API_PORT);
}

void bootstrap();
