import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { RenderNotePdfUseCase } from './application/render-note-pdf.use-case.js';
import {
  RenderReceiptUseCase,
  RenderReleaseUseCase,
  RenderStatementUseCase,
  RenderEvidenceUseCase,
} from './application/render-documents.use-case.js';
import { BuildLegalPackageUseCase } from './application/legal-package.use-case.js';
import { ARCHIVE_BUILDER, type ArchiveBuilder } from './domain/ports/archive-builder.js';

@Controller({ path: 'admin/notes', version: '1' })
@Roles('ADMIN')
export class DocumentsController {
  constructor(
    private readonly renderNote: RenderNotePdfUseCase,
    private readonly renderReceipt: RenderReceiptUseCase,
    private readonly renderRelease: RenderReleaseUseCase,
    private readonly renderStatement: RenderStatementUseCase,
    private readonly renderEvidence: RenderEvidenceUseCase,
    private readonly legalPackage: BuildLegalPackageUseCase,
    @Inject(ARCHIVE_BUILDER) private readonly archives: ArchiveBuilder,
  ) {}

  @Get(':id/documents/note')
  async note(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.renderNote.execute({ id }, this.contextOf(actor, request));

    this.sendPdf(response, pdf, `pagare-${id}`);
  }

  /** Recibo de un abono, con su propio folio (§17.1). */
  @Get(':id/documents/receipt/:paymentId')
  async receipt(
    @Param('paymentId') paymentId: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.renderReceipt.execute({ paymentId }, this.contextOf(actor, request));
    this.sendPdf(response, pdf, `recibo-${paymentId}`);
  }

  /** Carta de finiquito: sólo si el pagaré está liquidado. */
  @Get(':id/documents/release')
  async release(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.renderRelease.execute({ noteId: id }, this.contextOf(actor, request));
    this.sendPdf(response, pdf, `finiquito-${id}`);
  }

  /** Certificado de evidencia de firma (§24.1). */
  @Get(':id/documents/evidence')
  async evidence(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.renderEvidence.execute({ noteId: id }, this.contextOf(actor, request));
    this.sendPdf(response, pdf, `evidencia-${id}`);
  }

  /**
   * Paquete legal en zip (§24.5): todo lo que pide el abogado, en una descarga.
   *
   * Si falta una pieza el zip sale igual con la lista de lo que falta, y las
   * cabeceras lo dicen para que la interfaz pueda avisarlo sin abrir el archivo.
   */
  @Get(':id/legal-package')
  async legal(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const pack = await this.legalPackage.execute({ noteId: id }, this.contextOf(actor, request));

    response
      .status(200)
      .setHeader('Content-Type', 'application/zip')
      .setHeader('Content-Disposition', `attachment; filename="${pack.filename}"`)
      .setHeader('X-Package-Contents', String(pack.contents.length))
      .setHeader('X-Package-Missing', String(pack.missing.length));

    // El zip se escribe en la respuesta a medida que se comprime: un expediente
    // con escaneos grandes no puede pasar entero por la memoria del proceso.
    await this.archives.buildTo(pack.entries, response);
  }

  private contextOf(actor: Actor, request: Request & { traceId?: string }) {
    return {
      traceId: request.traceId ?? 'unknown',
      actorId: actor.id,
      actorRole: actor.role,
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    };
  }

  private sendPdf(response: Response, pdf: Buffer, filename: string): void {
    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`)
      .send(pdf);
  }
}

@Controller({ path: 'admin/debtors', version: '1' })
@Roles('ADMIN')
export class DebtorDocumentsController {
  constructor(private readonly renderStatement: RenderStatementUseCase) {}

  /** Estado de cuenta del cliente a la fecha de corte de hoy. */
  @Get(':id/statement')
  async statement(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.renderStatement.execute(
      { debtorId: id },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="estado-cuenta-${id}.pdf"`)
      .send(pdf);
  }
}
