import { Document, Page, Text, View } from '@react-pdf/renderer';
import { base, Campo, Membrete, Marco, Pie, Renglon, Seccion, Titulo } from './documento-base.js';

export interface ReceiptModel {
  receiptFolio: string;
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
  debtorName: string;
  amountFormatted: string;
  amountInWords: string;
  appliedToInterest: string;
  appliedToOrdinaryInterest: string;
  appliedToPrincipal: string;
  balanceAfter: string;
  paidOnFormatted: string;
  methodLabel: string;
  reference: string | null;
  issuedAtFormatted: string;
  verifyUrl?: string | null | undefined;
}

/**
 * Recibo de abono (§17.1).
 *
 * Es el papel con el que el deudor demuestra que pagó, así que dice **de quién**
 * se recibió, **cuánto**, **a qué pagaré** se aplicó y **en qué se repartió**.
 * Sin ese desglose no puede verificar por qué su saldo bajó lo que bajó, que es
 * justo la llamada que llega dos días después.
 */
export function ReceiptDocument({ model }: { model: ReceiptModel }) {
  return (
    <Document title={`Recibo ${model.receiptFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={base.page}>
        <Marco />
        <Membrete emisor={model} etiqueta="RECIBO" folio={model.receiptFolio} />

        <Titulo>RECIBO DE PAGO</Titulo>

        <View style={{ borderWidth: 0.8, borderColor: '#101A16', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 }}>
          <Text style={{ fontSize: 22, fontFamily: 'Times-Bold' }}>{model.amountFormatted}</Text>
          <Text style={{ fontSize: 8.5, color: '#6A7A71', marginTop: 3 }}>{model.amountInWords}</Text>
        </View>

        {/* En prosa y no sólo en campos: es la fórmula que cualquiera reconoce
            como un recibo, y la que sirve si hay que enseñarlo. */}
        <Text style={{ fontSize: 11, fontFamily: 'Times-Roman', lineHeight: 1.6, marginBottom: 6 }}>
          Recibí de <Text style={{ fontFamily: 'Times-Bold' }}>{model.debtorName}</Text> la
          cantidad de <Text style={{ fontFamily: 'Times-Bold' }}>{model.amountFormatted}</Text> (
          {model.amountInWords}) el {model.paidOnFormatted}, que se aplica al pagaré{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.noteFolio}</Text>.
        </Text>

        <View style={base.fila}>
          <Campo label="Fecha de pago" value={model.paidOnFormatted} />
          <Campo
            label="Forma de pago"
            value={model.methodLabel + (model.reference ? ` · ${model.reference}` : '')}
          />
        </View>

        {/*
          * Tres conceptos y no dos (ADR 0020). El interés del préstamo y la
          * sanción por atraso son cosas distintas: juntarlas le impedía al
          * deudor verificar qué pagó, y un abono a una cuota al corriente salía
          * entero «a capital» aunque parte fuera el precio del préstamo.
          */}
        <Seccion>En qué se aplicó</Seccion>
        <Renglon concepto="Interés del préstamo" importe={model.appliedToOrdinaryInterest} />
        <Renglon concepto="Interés moratorio" importe={model.appliedToInterest} />
        <Renglon concepto="Capital" importe={model.appliedToPrincipal} />
        <Renglon concepto="Total recibido" importe={model.amountFormatted} total />

        <Seccion>Cómo queda el pagaré</Seccion>
        <Renglon concepto="Saldo pendiente tras este pago" importe={model.balanceAfter} total />

        <View style={{ flexGrow: 1 }} />

        <View style={base.firma}>
          <View style={base.firmaLinea} />
          <Text style={base.firmaNombre}>{model.organizationName}</Text>
          <Text style={base.evidencia}>QUIEN RECIBE</Text>
        </View>

        <Text style={base.nota}>
          Conserva este recibo: es el comprobante del pago. Los abonos quedan además anotados en
          el propio pagaré, y al quedar cubierto puedes pedir la devolución del título original.
        </Text>

        <Pie emisor={model} verifyUrl={model.verifyUrl} issuedAtFormatted={model.issuedAtFormatted} />
      </Page>
    </Document>
  );
}
