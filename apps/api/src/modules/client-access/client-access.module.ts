import { Module } from '@nestjs/common';
import { ClientController } from './client.controller.js';
import { PublicNotesController } from './public.controller.js';
import { DocumentsModule } from '../documents/documents.module.js';

/**
 * Lo que ve el cliente (§0). Importa `DocumentsModule` por su puerto: la app
 * descarga su pagaré y sus recibos, y quien los dibuja es aquel módulo.
 */
@Module({ imports: [DocumentsModule], controllers: [ClientController, PublicNotesController] })
export class ClientAccessModule {}
