import { api } from '@/shared/api/client';

export interface OrganizationIdentity {
  legalName: string;
  place: string | null;
}

/**
 * Quién presta, para las pantallas sin sesión (§25.4).
 *
 * Se pregunta a la API en vez de escribirlo en el código: el nombre lo pone el
 * administrador en Ajustes, y tenerlo copiado aquí hacía que cambiarlo dejara
 * la pantalla de acceso anunciando a otra empresa.
 *
 * Si la API no contesta, la puerta de entrada **tiene que abrirse igual**: sin
 * nombre se enseña «Pagarés», que es cierto, y nadie se queda sin poder entrar
 * porque el rótulo no cargara.
 */
export async function organizationIdentity(): Promise<OrganizationIdentity> {
  try {
    const org = await api<{ legalName: string | null; place: string | null }>(
      '/public/organization',
      // El rótulo cambia como mucho una vez en la vida de la instalación: se
      // cachea una hora para no preguntar en cada intento de acceso.
      { revalidate: 3600 },
    );
    return { legalName: org.legalName ?? 'Pagarés', place: org.place };
  } catch {
    return { legalName: 'Pagarés', place: null };
  }
}
