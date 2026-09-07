import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../shared/http/auth.guard.js';
import { PUBLIC_THROTTLE } from '../../shared/http/throttler.config.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';

/**
 * Quién presta, para las pantallas que se ven sin sesión.
 *
 * El acceso llevaba el nombre y la ciudad escritos a mano en el código: quien
 * cambiaba la razón social en Ajustes la veía cambiada en todo el panel menos
 * en la puerta de entrada, que seguía anunciando a otra empresa. Un dato en dos
 * sitios acaba diciendo dos cosas.
 *
 * Sólo sale lo que ya está impreso en el propio pagaré y en la consulta
 * pública: cómo se llama el acreedor y dónde se paga. Nada de correo, teléfono,
 * cuentas ni preferencias de cálculo — eso es de dentro.
 */
@Controller({ path: 'public/organization', version: '1' })
export class PublicOrganizationController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle(PUBLIC_THROTTLE)
  @Get()
  async identity() {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
      select: { legalName: true, defaultPaymentPlace: true },
    });

    // Una instalación recién montada todavía no tiene nombre: se contesta con
    // nulos y la pantalla enseña lo suyo, en vez de una cadena vacía.
    return {
      legalName: settings?.legalName || null,
      place: settings?.defaultPaymentPlace || null,
    };
  }
}
