import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface ReleaseModel {
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  amountFormatted: string;
  settledOnFormatted: string;
  issuedAtFormatted: string;
  place: string;
}

/**
 * Carta de finiquito (§17.1). Se genera sola al llegar el saldo a cero: es el
 * documento que el deudor pide y que, hecho a mano, se redacta tarde o nunca.
 */
const s = StyleSheet.create({
  page: { paddingHorizontal: 56, paddingVertical: 56, fontSize: 11, color: '#121B17', lineHeight: 1.7 },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: '#0B5340', textTransform: 'uppercase' },
  title: { fontSize: 18, marginTop: 6, marginBottom: 28 },
  paragraph: { marginBottom: 14 },
  strong: { fontWeight: 'bold' },
  signature: { marginTop: 64, alignItems: 'center' },
  line: { borderTopWidth: 0.8, borderTopColor: '#121B17', width: 240 },
  name: { fontSize: 10, marginTop: 6 },
  footer: { position: 'absolute', bottom: 32, left: 56, right: 56, fontSize: 7, color: '#6A7A71' },
});

export function ReleaseDocument({ model }: { model: ReleaseModel }) {
  return (
    <Document title={`Finiquito ${model.noteFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.eyebrow}>Carta de finiquito</Text>
        <Text style={s.title}>No adeudo</Text>

        <Text style={s.paragraph}>
          {model.place}, a {model.issuedAtFormatted}.
        </Text>

        <Text style={s.paragraph}>A quien corresponda:</Text>

        <Text style={s.paragraph}>
          Por medio de la presente, <Text style={s.strong}>{model.organizationName}</Text> hace
          constar que <Text style={s.strong}>{model.debtorName}</Text> liquidó en su totalidad el
          pagaré con folio <Text style={s.strong}>{model.noteFolio}</Text>, por un importe de{' '}
          {model.amountFormatted}, quedando cubierto el {model.settledOnFormatted}.
        </Text>

        <Text style={s.paragraph}>
          En consecuencia, no existe adeudo alguno pendiente derivado de dicho documento, y se
          extiende el presente finiquito para los fines que al interesado convengan.
        </Text>

        <View style={s.signature}>
          <View style={s.line} />
          <Text style={s.name}>{model.organizationName}</Text>
        </View>

        <Text style={s.footer} fixed>
          {model.organizationName} · {model.organizationAddress}
        </Text>
      </Page>
    </Document>
  );
}
