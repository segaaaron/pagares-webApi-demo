import { z } from 'zod';
import { emailSchema } from './common.js';

/** Política de §10.2: 12 caracteres mínimo, sin caducidad forzada. */
export const passwordSchema = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(128);

/**
 * El token de push viaja aquí, no en un endpoint propio: así el cliente conserva
 * su regla de sólo lectura más la firma (§24.3).
 */
const deviceSchema = z
  .object({
    deviceId: z.string().min(8).max(128),
    pushToken: z.string().min(8).max(256).optional(),
    platform: z.enum(['ios', 'web']).default('web'),
    /*
     * Desde dónde entra, para el panel y para soporte. Van opcionales porque el
     * navegador no los manda, y el bloque es `.strict()`: cualquier campo no
     * declarado tumba el login entero con 422, así que añadir uno del lado del
     * cliente sin declararlo aquí deja a esa versión de la app sin poder entrar.
     */
    /** Identificador de hardware —«iPhone17,1»—, no la familia comercial. */
    model: z.string().trim().max(80).optional(),
    osVersion: z.string().trim().max(40).optional(),
    appVersion: z.string().trim().max(40).optional(),
  })
  .strict()
  .optional();

export const loginRequestSchema = z
  .object({ email: emailSchema, password: z.string().min(1), device: deviceSchema })
  .strict();

/**
 * Sesión abierta. La devuelven el login y el cambio obligatorio del primer
 * acceso, así que vive en un solo sitio: el refresh **no** aparece porque viaja
 * en cookie httpOnly y ahí se queda (§9.2).
 */
export const sessionResponseSchema = z
  .object({
    outcome: z.literal('session'),
    accessToken: z.string(),
    expiresIn: z.number().int(),
    role: z.enum(['ADMIN', 'CLIENT']),
    /** Para saludar por su nombre y para saber con qué cuenta se está. */
    user: z.object({ fullName: z.string(), email: emailSchema }).strict(),
  })
  .strict();

/** Respuesta del login: sesión normal, o el reto de cambio obligatorio. */
export const loginResponseSchema = z.discriminatedUnion('outcome', [
  sessionResponseSchema,
  z
    .object({
      outcome: z.literal('must_change_password'),
      changeToken: z.string(),
      expiresIn: z.number().int(),
    })
    .strict(),
]);

/**
 * Cambio obligatorio del primer acceso. Devuelve sesión, así que acepta el mismo
 * bloque `device` que el login: quien acaba de estrenar contraseña no tiene por
 * qué volver a autenticarse (§10.3, flujo 2).
 */
export const changeInitialPasswordRequestSchema = z
  .object({ changeToken: z.string().min(10), newPassword: passwordSchema, device: deviceSchema })
  .strict();

export const forgotPasswordRequestSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordRequestSchema = z
  .object({
    email: emailSchema,
    code: z.string().regex(/^\d{6}$/, 'El código es de 6 dígitos'),
    newPassword: passwordSchema,
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .strict();

/** El cambio inicial termina en sesión, no en un `ok: true` (§10.3, flujo 2). */
export const changeInitialPasswordResponseSchema = sessionResponseSchema;

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
