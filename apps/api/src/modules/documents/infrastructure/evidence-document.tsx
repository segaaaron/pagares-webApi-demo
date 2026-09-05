import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { base, GRIS, Membrete, Marco, Pie, REGLA, Seccion, Titulo } from './documento-base.js';

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
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
  verifyUrl?: string | null | undefined;
}

/**
 * Certificado de evidencia de firma (§24.1).
 *
 * Los datos ya se capturaban; lo que faltaba era **poder demostrarlos**. Esto
 * convierte "tengo una imagen de su firma" en "tengo constancia de cómo y cuándo
 * firmó, con qué dispositivo y desde qué dirección".
 */
const s = StyleSheet.create({
  intro: { fontSize: 10, fontFamily: 'Times-Roman', lineHeight: 1.65, marginBottom: 6 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.4, borderBottomColor: REGLA },
  label: { width: '38%', color: GRIS },
  value: { width: '62%' },
  hash: { width: '62%', fontFamily: 'Courier', fontSize: 7.5 },
  notice: {
    marginTop: 18,
    padding: 11,
    backgroundColor: '#F7EEDC',
    borderLeftWidth: 2,
    borderLeftColor: '#8A5A12',
    fontSize: 8.5,
    lineHeight: 1.5,
    color: '#8A5A12',
  },
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
      <Page size="LETTER" style={base.page}>
        <Marco />
        <Membrete emisor={model} etiqueta="CERTIFICADO" folio={model.noteFolio} />

        <Titulo nota="Cómo, cuándo y desde dónde se firmó">EVIDENCIA DE FIRMA</Titulo>

        <Text style={s.intro}>
          Este documento hace constar las circunstancias en que se capturó la firma del pagaré{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.noteFolio}</Text>, por{' '}
          {model.amountFormatted}, suscrito por{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.debtorName}</Text>. Las huellas de
          abajo permiten comprobar que ni el documento ni el trazo cambiaron desde entonces.
        </Text>

        <Seccion>Integridad</Seccion>
        <View style={s.row}>
          <Text style={s.label}>Huella del documento</Text>
          <Text style={s.hash}>{model.documentSha256}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Huella de la firma</Text>
          <Text style={s.hash}>{model.signatureSha256}</Text>
        </View>

        <Seccion>Momento</Seccion>
        <Row label="Firma capturada" value={model.capturedAtFormatted} />
        {model.acceptedAtFormatted ? <Row label="Aceptación registrada" value={model.acceptedAtFormatted} /> : null}
        {model.scrolledToEndAtFormatted ? (
          <Row label="Documento leído hasta el final" value={model.scrolledToEndAtFormatted} />
        ) : null}

        <Seccion>Modalidad y origen</Seccion>
        <Row
          label="Modalidad"
          value={modeLabel}
        />
        {inPerson && model.enabledByLabel ? <Row label="Habilitada por" value={model.enabledByLabel} /> : null}
        <Row label="Dirección de origen" value={model.ipAddress ?? 'No registrada'} />
        <Row label="Dispositivo" value={model.deviceModel ?? 'No registrado'} />
        <Row label="Sistema" value={model.osVersion ?? 'No registrado'} />
        <Row label="Versión de la aplicación" value={model.appVersion ?? 'No registrada'} />

        <Seccion>Trazo</Seccion>
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

        <Text style={base.nota}>
          Este certificado acompaña al pagaré y no lo sustituye. Comprueba las huellas contra el
          documento que tengas: si alguna no coincide, el archivo no es el que se firmó.
        </Text>

        <Pie
          emisor={model}
          verifyUrl={model.verifyUrl}
          issuedAtFormatted={model.issuedAtFormatted}
        />
      </Page>
    </Document>
  );
}
