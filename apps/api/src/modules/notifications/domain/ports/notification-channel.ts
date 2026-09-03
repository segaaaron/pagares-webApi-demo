export interface PushMessage {
  /** Token del dispositivo, tal como lo registró el login (§24.3). */
  token: string;
  title: string;
  body: string;
  /** Qué abrir al tocar el aviso. La app resuelve la ruta. */
  data?: Record<string, string> | undefined;
}

export interface PushResult {
  token: string
  delivered: boolean;
  /** `true` cuando el proveedor dice que el token ya no vale y hay que borrarlo. */
  expired: boolean;
  error?: string | undefined;
}

/**
 * Canal de notificación distinto del correo (§3.1, §24.3).
 *
 * Un solo método y sin estado: quién recibe y qué dice lo decide el despachador,
 * porque **cada push es un espejo del correo** y un solo lugar tiene que decidir
 * qué se comunica (§13.1). Un canal que redactara sus propios textos es como se
 * acaba diciendo dos cosas distintas al mismo deudor.
 */
export interface NotificationChannel {
  /** `false` cuando no está configurado: el sistema sigue, sin push. */
  readonly enabled: boolean;
  send(message: PushMessage): Promise<PushResult>;
}

export const PUSH_CHANNEL = Symbol('NotificationChannel');
