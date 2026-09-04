import { Document, Page, StyleSheet, Text, View, Image } from '@react-pdf/renderer';
import type { NoteDocumentModel } from '../domain/ports/pdf-renderer.js';

/**
 * Plantilla del pagaré. Se construye con flexbox: añadir un bloque —el aval, por
 * ejemplo— recoloca lo demás solo. Con posicionamiento por coordenadas habría que
 * recalcular a mano todo lo que va debajo (§17.1).
 */
const s = StyleSheet.create({
  page: { paddingHorizontal: 48, paddingVertical: 44, fontSize: 10, color: '#121B17' },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: '#0B5340', textTransform: 'uppercase' },
  folio: { fontSize: 11, color: '#0B5340', marginTop: 2 },
  title: { fontSize: 22, marginTop: 18, marginBottom: 2 },
  words: { fontSize: 9, color: '#6A7A71', marginBottom: 18 },
  promise: { fontSize: 11, lineHeight: 1.6, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 24, marginBottom: 10 },
  col: { flex: 1 },
  label: { fontSize: 7.5, color: '#6A7A71', textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { fontSize: 10, marginTop: 2 },
  divider: { borderTopWidth: 0.6, borderTopColor: '#D2DAD4', marginVertical: 16 },
  signatureBox: { marginTop: 28, alignItems: 'center' },
  signatureImage: { height: 62, objectFit: 'contain' },
  signatureLine: { borderTopWidth: 0.8, borderTopColor: '#121B17', width: 240, marginTop: 6 },
  signatureName: { fontSize: 9, marginTop: 5 },
  evidence: { fontSize: 7, color: '#6A7A71', marginTop: 3 },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, fontSize: 7, color: '#6A7A71' },
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.col}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export function NoteDocument({ model }: { model: NoteDocumentModel }) {
  return (
    <Document title={`Pagaré ${model.folio}`} author={model.organizationName}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.eyebrow}>Pagaré</Text>
        <Text style={s.folio}>{model.folio}</Text>

        <Text style={s.title}>{model.amountFormatted}</Text>
        <Text style={s.words}>{model.amountInWords}</Text>

        {/* Requisitos I y II del art. 170: la mención y la promesa incondicional.
            La forma "a la orden" es la de un título que circula por endoso; con
            la cláusula "no a la orden" (art. 25) sólo se cede, y el suscriptor
            conserva frente al cesionario las defensas que tenía. */}
        <Text style={s.promise}>
          Debo(emos) y pagaré(mos) incondicionalmente{' '}
          {model.negotiable ? 'a la orden de' : 'a'}{' '}
          <Text style={{ fontWeight: 'bold' }}>{model.creditorName}</Text> la cantidad de{' '}
          {model.amountFormatted} ({model.amountInWords}) en {model.paymentPlace} el día{' '}
          {model.dueDateFormatted}.
        </Text>

        {model.negotiable ? null : (
          <Text style={s.promise}>
            <Text style={{ fontWeight: 'bold' }}>NO A LA ORDEN — NO NEGOCIABLE.</Text> Este título
            no es transmisible por endoso; sólo puede cederse en los términos del artículo 25 de
            la Ley General de Títulos y Operaciones de Crédito, con los efectos de una cesión
            ordinaria.
          </Text>
        )}

        <View style={s.row}>
          <Field label="Lugar de expedición" value={model.issuePlace} />
          <Field label="Fecha de expedición" value={model.issueDateFormatted} />
        </View>
        <View style={s.row}>
          <Field label="Lugar de pago" value={model.paymentPlace} />
          <Field label="Fecha de pago" value={model.dueDateFormatted} />
        </View>
        <View style={s.row}>
          <Field label="Interés moratorio" value={model.interestRateLabel} />
          <Field label="Moneda" value={model.currency} />
        </View>

        <View style={s.divider} />

        <View style={s.row}>
          <Field label="Suscriptor" value={model.debtor.fullName} />
          <Field label="Teléfono" value={model.debtor.phone} />
        </View>
        <View style={s.row}>
          <Field label="Domicilio" value={model.debtor.address} />
        </View>

        {model.observations ? (
          <View style={s.row}>
            <Field label="Observaciones" value={model.observations} />
          </View>
        ) : null}

        {/* Bloque de firma del suscriptor y, debajo, uno por cada aval. */}
        <View style={s.signatureBox}>
          {model.signaturePngBase64 ? (
            <Image style={s.signatureImage} src={model.signaturePngBase64} />
          ) : null}
          <View style={s.signatureLine} />
          <Text style={s.signatureName}>{model.debtor.fullName}</Text>
          {model.signatureCapturedAt ? (
            <Text style={s.evidence}>
              Firmado el {model.signatureCapturedAt} · SHA-256 {model.signatureSha256?.slice(0, 24)}…
            </Text>
          ) : (
            <Text style={s.evidence}>Pendiente de firma</Text>
          )}
        </View>

        {/*
          * El aval se declara con sus datos, **sin espacio de firma**.
          *
          * El sistema no tiene forma de capturar su firma —no existe el flujo—,
          * así que dibujar una línea vacía y un «pendiente de firma» prometía un
          * paso que nunca llega y ensuciaba el documento con una carencia. Sus
          * datos sí van: son parte del título.
          */}
        {model.guarantors.length > 0 ? (
          <View>
            <Text style={s.eyebrow}>Por aval</Text>
            {model.guarantors.map((guarantor) => (
              <View key={guarantor.position}>
                <Text style={s.signatureName}>{guarantor.fullName}</Text>
                <Text style={s.evidence}>
                  {guarantor.address} · {guarantor.phone}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.footer} fixed>
          {[
            model.organizationName,
            model.organizationAddress,
            model.organizationPhone,
            model.organizationEmail,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Page>
    </Document>
  );
}
