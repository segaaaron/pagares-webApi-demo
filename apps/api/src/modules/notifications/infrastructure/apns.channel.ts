import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createSign } from 'node:crypto';
import { CLOCK, type Clock } from '@pagares/api-core';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import type {
  NotificationChannel,
  PushMessage,
  PushResult,
} from '../domain/ports/notification-channel.js';

/** El token de proveedor de APNs vale una hora; se renueva con margen. */
const PROVIDER_TOKEN_TTL_SECONDS = 3000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Envío de push a iOS por APNs (§24.3).
 *
 * Sin librería de terceros: APNs es HTTP/2 con un JWT ES256 en la cabecera, y
 * `node:http2` más `node:crypto` lo cubren. Añadir una dependencia para esto
 * traía su propio pool de conexiones y su propio calendario de actualizaciones.
 *
 * Tres decisiones que importan:
 *  · **Se reutiliza la sesión HTTP/2.** Abrir una por aviso es lo que hace que
 *    APNs empiece a tardar segundos.
 *  · **El token de proveedor se cachea** cincuenta minutos: firmarlo en cada
 *    envío es criptografía por gusto.
 *  · **Un `410` no es un error del sistema**: es un dispositivo que ya no
 *    existe, y lo que toca es borrar el token, no reintentar (§24.3).
 */
@Injectable()
export class ApnsChannel implements NotificationChannel, OnModuleDestroy {
  private readonly logger = new Logger(ApnsChannel.name);
  private session: ClientHttp2Session | null = null;
  private providerToken: { value: string; issuedAt: number } | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  get enabled(): boolean {
    return Boolean(
      this.env.APNS_KEY_P8 &&
        this.env.APNS_KEY_ID &&
        this.env.APNS_TEAM_ID &&
        this.env.APNS_BUNDLE_ID,
    );
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (!this.enabled) {
      return { token: message.token, delivered: false, expired: false, error: 'push no configurado' };
    }

    const payload = JSON.stringify({
      aps: {
        alert: { title: message.title, body: message.body },
        sound: 'default',
        'content-available': 1,
      },
      ...(message.data ?? {}),
    });

    try {
      const { status, body } = await this.request(message.token, payload);

      if (status === 200) return { token: message.token, delivered: true, expired: false };

      // 410: el dispositivo ya no tiene la app. 400 con BadDeviceToken: igual.
      const expired = status === 410 || body.includes('BadDeviceToken');
      return {
        token: message.token,
        delivered: false,
        expired,
        error: `APNs respondió ${status}: ${body || 'sin detalle'}`,
      };
    } catch (error) {
      // La red no es un motivo para tumbar la operación que originó el aviso.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn({ token: message.token.slice(0, 8), reason });
      return { token: message.token, delivered: false, expired: false, error: reason };
    }
  }

  onModuleDestroy(): void {
    this.session?.close();
    this.session = null;
  }

  private async request(
    token: string,
    payload: string,
  ): Promise<{ status: number; body: string }> {
    const session = this.openSession();

    return new Promise((resolve, reject) => {
      const stream = session.request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        authorization: `bearer ${this.token()}`,
        'apns-topic': this.env.APNS_BUNDLE_ID ?? '',
        'apns-push-type': 'alert',
        // Sin prioridad explícita, un aviso de cobro puede quedar en cola.
        'apns-priority': '10',
        'content-type': 'application/json',
      });

      let status = 0;
      let body = '';

      stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
        stream.close();
        reject(new Error('APNs no respondió a tiempo'));
      });
      stream.on('response', (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      stream.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      stream.on('end', () => resolve({ status, body }));
      stream.on('error', reject);

      stream.end(payload);
    });
  }

  private openSession(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;

    const host =
      this.env.APNS_ENVIRONMENT === 'production'
        ? 'https://api.push.apple.com'
        : 'https://api.sandbox.push.apple.com';

    const session = connect(host);
    // Si la sesión muere, se olvida: la siguiente llamada abre otra.
    session.on('error', (error) => {
      this.logger.warn({ reason: error.message });
      this.session = null;
    });
    session.on('close', () => {
      this.session = null;
    });

    this.session = session;
    return session;
  }

  /** JWT ES256 firmado con la clave .p8, cacheado mientras siga válido. */
  private token(): string {
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    if (this.providerToken && nowSeconds - this.providerToken.issuedAt < PROVIDER_TOKEN_TTL_SECONDS) {
      return this.providerToken.value;
    }

    const header = base64url(JSON.stringify({ alg: 'ES256', kid: this.env.APNS_KEY_ID }));
    const claims = base64url(JSON.stringify({ iss: this.env.APNS_TEAM_ID, iat: nowSeconds }));

    // La clave llega en una variable de entorno, así que sus saltos de línea
    // vienen escapados: el PEM no se parsea sin devolvérselos.
    const pem = (this.env.APNS_KEY_P8 ?? '').replace(/\\n/g, '\n');
    const signature = createSign('SHA256')
      .update(`${header}.${claims}`)
      .sign({ key: pem, dsaEncoding: 'ieee-p1363' })
      .toString('base64url');

    const value = `${header}.${claims}.${signature}`;
    this.providerToken = { value, issuedAt: nowSeconds };
    return value;
  }
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
