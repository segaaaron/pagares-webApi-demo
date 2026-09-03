import { z } from 'zod';

/**
 * Validación del entorno al arrancar (§9.1, API8): si falta una variable el
 * proceso muere con un mensaje claro, en vez de fallar a media operación.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('America/Mexico_City'),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().transform((v) => v.split(',').map((s) => s.trim())),
  DATABASE_URL: z.string().url(),
  /**
   * Dónde viven las firmas y los anexos.
   *
   * `local` guarda en un volumen del servidor: sin servicio aparte y sin llaves,
   * que es lo que necesita una instalación de un solo servidor. `s3` usa un
   * bucket compatible con S3 —MinIO, R2— y hace falta cuando haya más de una
   * instancia de la API o se quiera delegar la copia de seguridad (§8).
   */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  /** Carpeta del volumen, sólo para `local`. */
  STORAGE_LOCAL_DIR: z.string().default('/data/storage'),
  /** URL pública de la API: los enlaces de archivo son absolutos. */
  API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // Sólo con STORAGE_DRIVER=s3. El adaptador comprueba que estén al arrancar.
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  STORAGE_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_SECRET_KEY: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TEMP_PASSWORD_TTL_HOURS: z.coerce.number().int().positive().default(72),
  MAIL_DRIVER: z.enum(['mailpit', 'resend']).default('mailpit'),
  MAIL_FROM: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  /**
   * Secreto del webhook de Resend (Svix). Sin él el endpoint responde 503 en
   * lugar de aceptar cualquier cuerpo: un webhook sin verificar es una vía para
   * que cualquiera marque como entregado lo que nunca salió (§9.1).
   */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Push a iOS (§24.3). Si falta cualquiera de las cuatro, el canal queda
   * apagado y el sistema sigue funcionando sólo con correo: un push sin
   * configurar no puede ser motivo de que no se registre un abono.
   */
  APNS_KEY_P8: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  /**
   * Accesos permitidos por IP cada 15 minutos (§25.7).
   *
   * Diez es el valor de producción y el que se usa si nadie dice nada. Es
   * configurable porque la suite de extremo a extremo abre varias sesiones
   * seguidas y, con el límite de producción, fallaría por el rate limit y no por
   * lo que está probando. Subirlo en producción es una decisión, no un descuido.
   */
  RATE_LIMIT_AUTH_PER_15M: z.coerce.number().int().positive().default(10),
  /** Ráfaga permitida por IP y minuto (§25.7). */
  RATE_LIMIT_BURST_PER_MIN: z.coerce.number().int().positive().default(120),
  /**
   * Cuántos proxies hay delante de la API.
   *
   * `0` es acceso directo. En el VPS hay uno —el proxy de Dokploy—, y sin
   * decirlo aquí `request.ip` es siempre la del proxy: el límite de tasa pasa a
   * ser común para toda la instalación y la bitácora anota la IP equivocada en
   * cada acción sensible (§9.3). Se cuenta en saltos y no con un booleano
   * porque confiar en toda la cadena de `X-Forwarded-For` deja que el cliente
   * se invente su origen.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detail}`);
  }
  return parsed.data;
}
