import { Document, Page, Text, View } from '@react-pdf/renderer';
import { base, Campo, Membrete, Marco, Pie, Titulo } from './documento-base.js';

export interface ReleaseModel {
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
  debtorName: string;
  amountFormatted: string;
  amountInWords?: string;
  settledOnFormatted: string;
  issuedAtFormatted: string;
  place: string;
  verifyUrl?: string | null | undefined;
}

/**
 * Carta de finiquito (§17.1).
 *
 * Se genera sola al llegar el saldo a cero, que es lo que la hace existir: hecha
 * a mano se redacta tarde o nunca, y el deudor se queda sin el papel que le
 * permite demostrar que no debe nada.
 *
 * Va en prosa formal y no en campos: es una carta, y se enseña como carta.
 */
export function ReleaseDocument({ model }: { model: ReleaseModel }) {
  return (
    <Document title={`Finiquito ${model.noteFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={base.page}>
        <Marco />
        <Membrete emisor={model} etiqueta="FINIQUITO" folio={model.noteFolio} />

        <Titulo nota="Constancia de no adeudo">CARTA DE FINIQUITO</Titulo>

        <Text style={{ fontSize: 10, color: '#6A7A71', marginBottom: 18 }}>
          {model.place}, a {model.issuedAtFormatted}.
        </Text>

        <Text style={{ fontSize: 11, fontFamily: 'Times-Roman', lineHeight: 1.7, marginBottom: 14 }}>
          A quien corresponda:
        </Text>

        <Text style={{ fontSize: 11, fontFamily: 'Times-Roman', lineHeight: 1.7, marginBottom: 14 }}>
          Por medio de la presente,{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.organizationName}</Text> hace constar
          que <Text style={{ fontFamily: 'Times-Bold' }}>{model.debtorName}</Text> liquidó en su
          totalidad el pagaré con folio{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.noteFolio}</Text>, por un importe de{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.amountFormatted}</Text>
          {model.amountInWords ? ` (${model.amountInWords})` : ''}, quedando cubierto el{' '}
          {model.settledOnFormatted}.
        </Text>

        <Text style={{ fontSize: 11, fontFamily: 'Times-Roman', lineHeight: 1.7, marginBottom: 18 }}>
          En consecuencia, no existe adeudo alguno pendiente derivado de dicho documento, ni por
          capital, ni por intereses, ni por accesorio alguno, y se extiende el presente finiquito
          para los fines que al interesado convengan.
        </Text>

        {/* Los datos sueltos también, para no tener que leer la carta entera
            cuando lo que se busca es una fecha o una cifra. */}
        <View style={base.fila}>
          <Campo label="Pagaré" value={model.noteFolio} />
          <Campo label="Importe liquidado" value={model.amountFormatted} />
        </View>
        <View style={base.fila}>
          <Campo label="Fecha de liquidación" value={model.settledOnFormatted} />
          <Campo label="Deudor" value={model.debtorName} />
        </View>

        <View style={{ flexGrow: 1 }} />

        <View style={base.firma}>
          <View style={base.firmaLinea} />
          <Text style={base.firmaNombre}>{model.organizationName}</Text>
          <Text style={base.evidencia}>POR EL ACREEDOR</Text>
        </View>

        <Text style={base.nota}>
          Al quedar cubierto el pagaré, el suscriptor puede pedir la devolución del título
          original. Conserva esta carta: es la constancia de que la deuda quedó saldada.
        </Text>

        <Pie emisor={model} verifyUrl={model.verifyUrl} issuedAtFormatted={model.issuedAtFormatted} />
      </Page>
    </Document>
  );
}
