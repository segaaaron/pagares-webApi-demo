import { z } from 'zod';
import { emailSchema, phoneSchema } from './common.js';

/**
 * Alta de un deudor (§19.6, §24.5).
 *
 * Se piden los mismos datos que el importador de cartera, y en el mismo orden:
 * quien da de alta a mano y quien sube un archivo capturan lo mismo, así que
 * dos listas distintas sólo servirían para que una se quedara atrás.
 *
 * **Nombre, domicilio, teléfono y correo son obligatorios.** El domicilio va
 * impreso en el pagaré; el teléfono es el canal de cobranza; y el correo es por
 * donde viaja la contraseña temporal cuando se le da acceso a la aplicación
 * (§25.2), así que sin él la cuenta no se le puede entregar.
 */
export const createDebtorRequestSchema = z
  .object({
    fullName: z.string().trim().min(3).max(160),
    address: z.string().trim().min(3).max(240),
    phone: phoneSchema,
    email: emailSchema,
    /** Lo que hay que saber de esta persona y no cabe en un campo. */
    notes: z.string().trim().max(1000).nullish(),
    /**
     * CURP, opcional.
     *
     * Identifica mejor que el nombre —dos «Juan Pérez» no comparten CURP—, pero
     * exigirlo dejaría fuera a quien presta sobre la marcha. Se valida la forma
     * y el dígito verificador en el servidor: aquí sólo la longitud, porque un
     * schema no debería reimplementar una regla que ya vive en `domain-rules`.
     */
    curp: z.string().trim().toUpperCase().length(18).nullish(),
  })
  .strict();

export type CreateDebtorRequest = z.infer<typeof createDebtorRequestSchema>;
