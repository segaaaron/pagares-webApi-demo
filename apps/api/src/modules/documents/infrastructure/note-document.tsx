import { Document, Page, StyleSheet, Text, View, Image } from '@react-pdf/renderer';
import type { NoteDocumentModel } from '../domain/ports/pdf-renderer.js';

/**
 * El pagaré impreso (§17.1).
 *
 * Es el documento que se lleva a un juzgado y el que el deudor guarda en un
 * cajón durante tres años, así que se compone como un título y no como un
 * volcado de campos: marco doble, cifra en su caja como en un cheque, el texto
 * de la promesa en romana y los datos en una retícula con sus reglas.
 *
 * Lo que va dentro no es decoración. El art. 170 de la LGTOC pide la mención de
 * ser pagaré, la promesa incondicional, el beneficiario, la época y el lugar de
 * pago, la fecha y el lugar de suscripción y la firma. Y las **tasas pactadas**
 * —la ordinaria y la moratoria— tienen que constar en el título para poder
 * exigirse: sin ellas el juez no las concede aunque se hayan acordado.
 *
 * Se construye con flexbox: añadir un bloque recoloca lo demás solo. Con
 * coordenadas habría que recalcular a mano todo lo que va debajo.
 */
import {
  base,
  Campo,
  Marco,
  Membrete,
  Pie,
  Titulo,
  REGLA,
  TINTA,
  GRIS,
} from './documento-base.js';

/** Lo propio del pagaré. Lo compartido —marco, membrete, pie— vive en la base. */
const s = StyleSheet.create({
  // La cifra va en su caja, como en un cheque: es lo primero que se busca.
  cajaImporte: {
    borderWidth: 0.8,
    borderColor: TINTA,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importe: { fontSize: 24, fontFamily: 'Times-Bold' },
  importeLetra: { fontSize: 8.5, color: GRIS, marginTop: 3, maxWidth: 300 },
  moneda: { fontSize: 8, letterSpacing: 1.2, color: '#0B5340' },

  promesa: { fontSize: 11, fontFamily: 'Times-Roman', lineHeight: 1.65, marginBottom: 14 },
  clausula: {
    fontSize: 8.5,
    fontFamily: 'Times-Roman',
    lineHeight: 1.5,
    color: TINTA,
    borderLeftWidth: 2,
    borderLeftColor: '#0B5340',
    paddingLeft: 8,
    marginBottom: 14,
  },

  firmaImagen: { height: 58, objectFit: 'contain' },
  avalNota: { fontSize: 7, color: GRIS, marginTop: 4, lineHeight: 1.4 },

  abono: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.4,
    borderBottomColor: REGLA,
    paddingVertical: 3,
    fontSize: 8.5,
  },
  abonoTotal: { borderBottomWidth: 0, marginTop: 2 },

  verificacion: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  qr: { width: 52, height: 52 },
});

/** Lo que dice la marca de agua, o nada cuando el título está vivo y firmado. */
function marcaDe(status: string): string | null {
  if (status === 'PENDING_SIGNATURE' || status === 'PROCESSING_SIGNATURE') {
    return 'PENDIENTE DE FIRMA';
  }
  if (status === 'VOID') return 'ANULADO';
  if (status === 'RENEWED') return 'RENOVADO';
  if (status === 'PAID') return 'PAGADO';
  return null;
}

export function NoteDocument({ model }: { model: NoteDocumentModel }) {
  const marca = marcaDe(model.status);

  return (
    <Document title={`Pagaré ${model.folio}`} author={model.organizationName}>
      <Page size="LETTER" style={base.page}>
        <Marco />
        {marca ? <Text style={base.marca} fixed>{marca}</Text> : null}

        <Membrete emisor={model} etiqueta="FOLIO" folio={model.folio} />

        {/* Requisito I del art. 170: la mención de ser pagaré, en el texto. */}
        <Titulo>PAGARÉ</Titulo>

        <View style={s.cajaImporte}>
          <View>
            <Text style={s.importe}>{model.amountFormatted}</Text>
            <Text style={s.importeLetra}>{model.amountInWords}</Text>
          </View>
          <Text style={s.moneda}>{model.currency}</Text>
        </View>

        {/* Requisito II: la promesa incondicional. La forma «a la orden» es la
            del título que circula por endoso; con la cláusula «no a la orden»
            (art. 25) sólo se cede, y el suscriptor conserva sus defensas. */}
        <Text style={s.promesa}>
          Debo(emos) y pagaré(mos) incondicionalmente{' '}
          {model.negotiable ? 'a la orden de' : 'a'}{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.creditorName}</Text> la cantidad de{' '}
          <Text style={{ fontFamily: 'Times-Bold' }}>{model.amountFormatted}</Text> (
          {model.amountInWords}) en {model.paymentPlace} el día {model.dueDateFormatted}.
        </Text>

        {model.negotiable ? null : (
          <Text style={s.clausula}>
            <Text style={{ fontFamily: 'Times-Bold' }}>NO A LA ORDEN — NO NEGOCIABLE.</Text> Este
            título no es transmisible por endoso; sólo puede cederse en los términos del artículo
            25 de la Ley General de Títulos y Operaciones de Crédito, con los efectos de una
            cesión ordinaria.
          </Text>
        )}

        <View style={base.fila}>
          <Campo label="Lugar de expedición" value={model.issuePlace} />
          <Campo label="Fecha de expedición" value={model.issueDateFormatted} />
        </View>
        <View style={base.fila}>
          <Campo label="Lugar de pago" value={model.paymentPlace} />
          <Campo label="Fecha de pago" value={model.dueDateFormatted} />
        </View>

        {/*
          * Las tasas pactadas van escritas, las dos y por separado: la ordinaria
          * es el precio del préstamo y la moratoria la sanción por pagar tarde.
          * Si no constan en el título, no se pueden exigir.
          */}
        {model.plan ? (
          <>
            <Text style={base.seccion}>PLAN DE PAGOS PACTADO</Text>
            <View style={base.fila}>
              <Campo label="Esta cuota" value={model.plan.positionLabel} />
              <Campo label="Interés del préstamo" value={model.plan.rateLabel} />
            </View>
            <View style={base.fila}>
              <Campo label="Cálculo del interés" value={model.plan.modelLabel} />
              <Campo
                label="De esta cuota"
                value={`${model.plan.interestFormatted} de interés · ${model.plan.principalFormatted} de capital`}
              />
            </View>
          </>
        ) : null}

        <View style={base.fila}>
          {/* La tasa sin su base no se puede recalcular: 3 % mensual sobre 360
              días no da lo mismo que sobre 365. El art. 174 exige además que el
              moratorio esté pactado en el documento para poder cobrarlo. */}
          {/* La base sólo se dice cuando hay tasa: «sin intereses pactados ·
              base 360 días» es una contradicción impresa en un título. */}
          <Campo
            label="Interés moratorio"
            value={
              model.interestRateAnnualPct === null
                ? model.interestRateLabel
                : `${model.interestRateLabel} · base ${model.interestBasis} días`
            }
          />
          <Campo label="Moneda" value={model.currency} />
        </View>

        <Text style={base.seccion}>DATOS DEL SUSCRIPTOR</Text>
        <View style={base.fila}>
          <Campo label="Nombre" value={model.debtor.fullName} />
          <Campo label="Teléfono" value={model.debtor.phone} />
        </View>
        <View style={base.fila}>
          <Campo label="Domicilio" value={model.debtor.address} />
        </View>

        {model.observations ? (
          <View style={base.fila}>
            <Campo label="Observaciones" value={model.observations} />
          </View>
        ) : null}

        {/* Requisito VI: la firma del suscriptor. Debajo, su evidencia: sin el
            instante y la huella, la imagen es sólo un dibujo. */}
        {/* La firma no se parte entre hojas: media firma al pie de la primera
            es exactamente lo que no puede pasar en un título. */}
        <View style={base.firma} wrap={false}>
          {model.signaturePngBase64 ? (
            <Image style={s.firmaImagen} src={model.signaturePngBase64} />
          ) : null}
          <View style={base.firmaLinea} />
          <Text style={base.firmaNombre}>{model.debtor.fullName}</Text>
          {model.signatureCapturedAt ? (
            <Text style={base.evidencia}>
              Firmado el {model.signatureCapturedAt} · SHA-256{' '}
              {model.signatureSha256?.slice(0, 32)}
            </Text>
          ) : (
            <Text style={base.evidencia}>PENDIENTE DE FIRMA</Text>
          )}
        </View>

        {/*
          * El aval va con sus datos y **sin espacio de firma**: el sistema no
          * captura la del avalista, y dibujar una línea vacía prometería un paso
          * que no existe. La nota dice qué falta para que el aval obligue, en
          * vez de dejar creer que ya obliga (arts. 109-116 LGTOC).
          */}
        {model.guarantors.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <Text style={base.seccion}>AVAL DECLARADO</Text>
            {model.guarantors.map((guarantor) => (
              <View key={guarantor.position} style={{ marginBottom: 6 }}>
                <Text style={base.firmaNombre}>{guarantor.fullName}</Text>
                <Text style={base.evidencia}>
                  {guarantor.address} · {guarantor.phone}
                </Text>
              </View>
            ))}
            <Text style={s.avalNota}>
              Declarado por el suscriptor. Para que el aval obligue, el avalista debe firmar el
              título con la fórmula «por aval de {model.debtor.fullName}» (arts. 109 a 116 de la
              Ley General de Títulos y Operaciones de Crédito).
            </Text>
          </View>
        ) : null}

        {/* Lo que este papel es, dicho una vez y sin adornos: es la diferencia
            entre reclamar en un juicio ordinario o en uno ejecutivo. */}
        <Text style={base.nota}>
          Este pagaré es título ejecutivo y trae aparejada ejecución (arts. 167 y 174 de la Ley
          General de Títulos y Operaciones de Crédito). Prescribe a los tres años de su
          vencimiento (art. 165).
        </Text>

        {/*
          * El anexo va en su propia hoja, y a propósito: la primera es el
          * título —promesa, datos, abonos y firma— y la segunda es lo que
          * permite comprobarlo. Mezclarlos hacía que la firma acabara sola al
          * dorso, que es lo último que se quiere en un pagaré.
          */}
        {/*
          * Evidencia de la firma, titulada por lo que es.
          *
          * Son registros **propios del emisor**: no hay constancia de
          * conservación de un prestador acreditado ni sello de tiempo de un
          * tercero. Decir lo contrario en un papel que va a un juzgado es lo
          * único que puede hundirlo, así que se dice al revés y sin rodeos.
          */}
        {model.payments.length > 0 || model.signatureSha256 ? (
          <View break>
            <Text style={base.titulo}>ANEXO</Text>
            <View style={base.reglaTitulo} />
          </View>
        ) : null}

        {/*
          * Los abonos, anotados en el propio título (art. 17 LGTOC).
          *
          * Es lo que hace el tenedor con un pagaré de papel cuando recibe un
          * pago parcial, y por una razón práctica: sin la anotación, quien
          * tenga el documento puede cobrar dos veces lo mismo y el deudor que
          * ya pagó no tiene con qué defenderse.
          */}
        {model.payments.length > 0 ? (
          <View>
            <Text style={base.seccion}>ABONOS ANOTADOS EN ESTE TÍTULO</Text>
            {model.payments.map((abono, indice) => (
              <View key={`${abono.dateFormatted}-${indice}`} style={s.abono}>
                <Text>{abono.dateFormatted}</Text>
                <Text style={{ fontFamily: 'Courier' }}>{abono.amountFormatted}</Text>
              </View>
            ))}
            <View style={[s.abono, s.abonoTotal]}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Saldo pendiente</Text>
              <Text style={{ fontFamily: 'Courier-Bold' }}>{model.balanceFormatted}</Text>
            </View>
          </View>
        ) : null}


        {model.signatureSha256 ? (
          <View>
            <Text style={base.seccion}>EVIDENCIA DE FIRMA ELECTRÓNICA</Text>
            <View style={base.fila}>
              <Campo label="Huella de la firma (SHA-256)" value={model.signatureSha256} />
            </View>
            <View style={base.fila}>
              <Campo label="Capturada" value={model.signatureCapturedAt ?? 'No registrada'} />
              <Campo
                label="Modalidad"
                value={
                  model.signatureEvidence?.mode === 'IN_PERSON'
                    ? 'Presencial, en dispositivo del acreedor'
                    : model.signatureEvidence?.mode === 'PAPER'
                      ? 'Firmada en papel'
                      : 'Remota, en dispositivo del suscriptor'
                }
              />
            </View>
            <Text style={s.avalNota}>
              Estos son registros propios del emisor —huella, instante y circunstancias de la
              captura— y no una constancia de conservación NOM-151 ni un sello de tiempo emitido
              por un prestador de servicios de certificación acreditado.
            </Text>
          </View>
        ) : null}

        {model.verifyQrBase64 ? (
          <View style={s.verificacion}>
            <Image style={s.qr} src={model.verifyQrBase64} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold' }}>
                Verifica este pagaré
              </Text>
              <Text style={{ fontSize: 7, color: GRIS, marginTop: 2 }}>
                Escanea el código o abre {model.verifyUrl}. La página dice el folio, el importe y
                el estado
                {model.signatureSha256
                  ? ', y la huella de la firma para contrastarla con este archivo.'
                  : '.'}
              </Text>
            </View>
          </View>
        ) : null}

        <Pie
          emisor={model}
          verifyUrl={model.verifyUrl}
          issuedAtFormatted={model.issuedAtFormatted}
        />
      </Page>
    </Document>
  );
}
