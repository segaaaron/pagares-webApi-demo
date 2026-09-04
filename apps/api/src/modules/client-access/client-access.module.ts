import { Module } from '@nestjs/common';
import { ClientController } from './client.controller.js';
import { PublicNotesController } from './public.controller.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { SimulateEarlyPayoffUseCase } from '../promissory-notes/application/simulate-early-payoff.use-case.js';

/**
 * Lo que ve el cliente (§0). Importa `DocumentsModule` por su puerto: la app
 * descarga su pagaré y sus recibos, y quien los dibuja es aquel módulo.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [ClientController, PublicNotesController],
  // La liquidación anticipada la contesta el mismo caso de uso que el panel: la
  // cifra tiene que ser la misma cuando el deudor pregunta por la app y cuando
  // el administrador la mira en pantalla. Se provee aquí, sin importar el
  // módulo entero, como ya se hace con las piezas de abonos.
  providers: [SimulateEarlyPayoffUseCase],
})
export class ClientAccessModule {}
