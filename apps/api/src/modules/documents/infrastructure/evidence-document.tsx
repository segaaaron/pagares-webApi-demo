import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface EvidenceModel {
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  amountFormatted: string;
  documentSha256: string;
  signatureSha256: string;
  capturedAtFormatted: string;
  acceptedAtFormatted: string | null;
  scrolledToEndAtFormatted: string | null;
  mode: 'REMOTE' | 'IN_PERSON' | 'PAPER';
  enabledByLabel: string | null;
  ipAddress: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  inputType: string | null;
  strokeCount: number | null;
  durationMs: number | null;
  issuedAtFormatted: string;
}

/**
 * Certificado de evidencia de firma (§24.1).
 *
 * Los datos ya se capturaban; lo que faltaba era **poder demostrarlos**. Esto
 * convierte "tengo una imagen de su firma" en "tengo constancia de cómo y cuándo
 * firmó, con qué dispositivo y desde qué dirección".
 */
const s = StyleSheet.create({
  page: { paddingHorizontal: 48, paddingVertical: 44, fontSize: 9.5, color: '#121B17' },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: '#0B5340', textTransform: 'uppercase' },
  title: { fontSize: 17, marginTop: 6, marginBottom: 4 },
  intro: { fontSize: 10, lineHeight: 1.6, color: '#39473F', marginBottom: 20 },
  section: { fontSize: 8, letterSpacing: 1, color: '#6A7A71', textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#E8EDE9' },
  label: { width: '38%', color: '#6A7A71' },
  value: { width: '62%' },
  hash: { width: '62%', fontFamily: 'Courier', fontSize: 8 },
  notice: { marginTop: 22, padding: 12, backgroundColor: '#F4E9D4', fontSize: 8.5, lineHeight: 1.5, color: '#8A5A12' },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, fontSize: 7, color: '#6A7A71' },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export function EvidenceDocument({ model }: { model: EvidenceModel }) {
  const inPerson = model.mode === 'IN_PERSON';
  // El papel se nombra por lo que es. Un certificado que llamara "remota" a una
  // firma de tinta certificaría algo falso (§24.1).
  const modeLabel =
    model.mode === 'PAPER'
      ? 'En papel, anterior al sistema: sin trazo digital'
      : inPerson
        ? 'Presencial, en dispositivo del acreedor'
        : 'Remota, en dispositivo del suscriptor';

  return (
    <Document title={`Evidencia de firma ${model.noteFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.eyebrow}>Certificado</Text>
        <Text style={s.title}>Evidencia de firma electrónica</Text>
        <Text style={s.intro}>
          Este documento hace constar las circunstancias en que se capturó la firma del pagaré{' '}
          {model.noteFolio}, por {model.amountFormatted}, suscrito por {model.debtorName}.
        </Text>

        <Text style={s.section}>Integridad</Text>
        <View style={s.row}>
          <Text style={s.label}>Huella del documento</Text>
          <Text style={s.hash}>{model.documentSha256}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Huella de la firma</Text>
          <Text style={s.hash}>{model.signatureSha256}</Text>
        </View>

        <Text style={s.section}>Momento</Text>
        <Row label="Firma capturada" value={model.capturedAtFormatted} />
        {model.acceptedAtFormatted ? <Row label="Aceptación registrada" value={model.acceptedAtFormatted} /> : null}
        {model.scrolledToEndAtFormatted ? (
          <Row label="Documento leído hasta el final" value={model.scrolledToEndAtFormatted} />
        ) : null}

        <Text style={s.section}>Modalidad y origen</Text>
        <Row
          label="Modalidad"
          value={modeLabel}
        />
        {inPerson && model.enabledByLabel ? <Row label="Habilitada por" value={model.enabledByLabel} /> : null}
        <Row label="Dirección de origen" value={model.ipAddress ?? 'No registrada'} />
        <Row label="Dispositivo" value={model.deviceModel ?? 'No registrado'} />
        <Row label="Sistema" value={model.osVersion ?? 'No registrado'} />
        <Row label="Versión de la aplicación" value={model.appVersion ?? 'No registrada'} />

        <Text style={s.section}>Trazo</Text>
        <Row label="Método de entrada" value={model.inputType ?? 'No registrado'} />
        <Row label="Número de trazos" value={model.strokeCount !== null ? String(model.strokeCount) : 'No registrado'} />
        <Row
          label="Duración de la firma"
          value={model.durationMs !== null ? `${(model.durationMs / 1000).toFixed(1)} segundos` : 'No registrada'}
        />

        {inPerson ? (
          <Text style={s.notice}>
            Aviso: esta firma se capturó de forma presencial, en un dispositivo del acreedor. La
            dirección de origen y el dispositivo son, por tanto, los del acreedor y no los del
            suscriptor. Se hace constar expresamente para no presentarla como una firma remota.
          </Text>
        ) : null}

        <Text style={s.footer} fixed>
          {model.organizationName} · {model.organizationAddress} · Emitido el {model.issuedAtFormatted}
        </Text>
      </Page>
    </Document>
  );
}
