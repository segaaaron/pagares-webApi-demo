import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface ReceiptModel {
  receiptFolio: string;
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
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
}

/**
 * Recibo de abono (§17.1). Desglosa interés y capital porque sin ese desglose el
 * deudor no puede verificar por qué su saldo bajó lo que bajó.
 */
const s = StyleSheet.create({
  page: { paddingHorizontal: 48, paddingVertical: 44, fontSize: 10, color: '#121B17' },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: '#0B5340', textTransform: 'uppercase' },
  folio: { fontSize: 11, color: '#0B5340', marginTop: 2 },
  amount: { fontSize: 26, marginTop: 16 },
  words: { fontSize: 9, color: '#6A7A71', marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  label: { fontSize: 9, color: '#6A7A71' },
  value: { fontSize: 10 },
  divider: { borderTopWidth: 0.6, borderTopColor: '#D2DAD4', marginVertical: 14 },
  total: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  totalLabel: { fontSize: 10, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, fontSize: 7, color: '#6A7A71' },
});

export function ReceiptDocument({ model }: { model: ReceiptModel }) {
  return (
    <Document title={`Recibo ${model.receiptFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.eyebrow}>Recibo de pago</Text>
        <Text style={s.folio}>{model.receiptFolio}</Text>

        <Text style={s.amount}>{model.amountFormatted}</Text>
        <Text style={s.words}>{model.amountInWords}</Text>

        <View style={s.row}>
          <Text style={s.label}>Recibido de</Text>
          <Text style={s.value}>{model.debtorName}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Aplicado al pagaré</Text>
          <Text style={s.value}>{model.noteFolio}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Fecha de pago</Text>
          <Text style={s.value}>{model.paidOnFormatted}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Forma de pago</Text>
          <Text style={s.value}>
            {model.methodLabel}
            {model.reference ? ` · ${model.reference}` : ''}
          </Text>
        </View>

        <View style={s.divider} />

        {/*
          * Tres conceptos y no dos (ADR 0020). El interés del préstamo y la
          * sanción por atraso son cosas distintas, y juntarlas le impedía al
          * deudor verificar qué pagó: un abono a una cuota al corriente salía
          * entero "a capital" aunque parte fuera el precio del préstamo.
          */}
        <View style={s.row}>
          <Text style={s.label}>Aplicado a interés del préstamo</Text>
          <Text style={s.value}>{model.appliedToOrdinaryInterest}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Aplicado a interés moratorio</Text>
          <Text style={s.value}>{model.appliedToInterest}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Aplicado a capital</Text>
          <Text style={s.value}>{model.appliedToPrincipal}</Text>
        </View>

        <View style={s.divider} />

        <View style={s.total}>
          <Text style={s.totalLabel}>Saldo pendiente tras este pago</Text>
          <Text style={s.totalLabel}>{model.balanceAfter}</Text>
        </View>

        <Text style={s.footer} fixed>
          {model.organizationName} · {model.organizationAddress} · Emitido el {model.issuedAtFormatted}
        </Text>
      </Page>
    </Document>
  );
}
