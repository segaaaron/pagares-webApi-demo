import { StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * El armazón común de todo lo que se descarga (§17.1).
 *
 * Los cinco documentos —pagaré, recibo, estado de cuenta, finiquito y
 * certificado de firma— llegan al mismo escritorio y salen del mismo negocio,
 * así que tienen que parecer de la misma casa: mismo marco, mismo membrete,
 * mismo pie. Cuando cada uno traía su propia hoja de estilos, el recibo parecía
 * de otra empresa que el pagaré al que pertenece.
 *
 * Aquí vive lo que comparten. Lo que cada documento dice es suyo; cómo se
 * presenta, de todos.
 */
export const TINTA = '#101A16';
export const VERDE = '#0B5340';
export const GRIS = '#6A7A71';
export const REGLA = '#C9D3CC';
export const FONDO = '#F1F5F2';

export const base = StyleSheet.create({
  page: {
    paddingHorizontal: 42,
    paddingTop: 38,
    // El pie va fijo abajo: sin este hueco, el texto se le pega encima.
    paddingBottom: 76,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: TINTA,
  },

  // Marco doble: la convención de los documentos de crédito impresos, y de paso
  // delata a una copia recortada.
  marcoExterior: {
    position: 'absolute',
    top: 22,
    left: 22,
    right: 22,
    bottom: 22,
    borderWidth: 1.4,
    borderColor: VERDE,
  },
  marcoInterior: {
    position: 'absolute',
    top: 27,
    left: 27,
    right: 27,
    bottom: 27,
    borderWidth: 0.4,
    borderColor: REGLA,
  },

  membrete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  emisor: { flex: 1, paddingRight: 20 },
  emisorNombre: { fontSize: 11, fontFamily: 'Times-Bold', color: TINTA },
  emisorDato: { fontSize: 7.5, color: GRIS, marginTop: 1.5 },

  caja: { borderWidth: 0.8, borderColor: VERDE, paddingHorizontal: 10, paddingVertical: 6 },
  cajaEtiqueta: { fontSize: 6.5, letterSpacing: 1.4, color: VERDE },
  cajaValor: { fontSize: 12, fontFamily: 'Courier-Bold', color: TINTA, marginTop: 2 },

  titulo: {
    fontSize: 17,
    fontFamily: 'Times-Bold',
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: 22,
    color: TINTA,
  },
  reglaTitulo: { borderTopWidth: 0.8, borderTopColor: VERDE, marginTop: 6, marginBottom: 16 },
  subtitulo: { fontSize: 8.5, color: GRIS, textAlign: 'center', marginTop: -10, marginBottom: 16 },

  seccion: { fontSize: 7, letterSpacing: 1.6, color: VERDE, marginTop: 14, marginBottom: 7 },

  fila: { flexDirection: 'row', gap: 18 },
  campo: {
    flex: 1,
    borderBottomWidth: 0.4,
    borderBottomColor: REGLA,
    paddingBottom: 4,
    marginBottom: 9,
  },
  etiqueta: { fontSize: 6.5, color: GRIS, letterSpacing: 0.8 },
  valor: { fontSize: 9.5, marginTop: 2.5 },

  renglon: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.4,
    borderBottomColor: REGLA,
    paddingVertical: 4,
  },
  renglonTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.8,
    borderTopColor: TINTA,
    paddingTop: 6,
    marginTop: 4,
  },
  fuerte: { fontFamily: 'Helvetica-Bold' },
  cifra: { fontFamily: 'Courier' },
  cifraFuerte: { fontFamily: 'Courier-Bold' },

  firma: { marginTop: 22, alignItems: 'center' },
  firmaLinea: { borderTopWidth: 0.8, borderTopColor: TINTA, width: 250 },
  firmaNombre: { fontSize: 9.5, fontFamily: 'Times-Bold', marginTop: 5 },
  evidencia: { fontSize: 6.5, color: GRIS, marginTop: 3, fontFamily: 'Courier' },

  nota: { fontSize: 7, color: GRIS, marginTop: 14, fontFamily: 'Times-Roman', lineHeight: 1.4 },

  /*
   * El pie va en dos renglones centrados y no en dos columnas.
   *
   * En columnas, el nombre del emisor y el enlace de verificación competían por
   * la misma línea: con un domicilio largo y un dominio real se solapaban y la
   * numeración de hoja se salía del papel. Apilados no hay nada que se pise, y
   * el enlace se lee entero, que es para lo que está.
   */
  pie: {
    position: 'absolute',
    bottom: 30,
    left: 42,
    right: 42,
    borderTopWidth: 0.4,
    borderTopColor: REGLA,
    paddingTop: 5,
    fontSize: 6.5,
    color: GRIS,
    textAlign: 'center',
  },
  pieRenglon: { textAlign: 'center', marginTop: 1.5 },

  marca: {
    position: 'absolute',
    top: 430,
    left: 0,
    right: 0,
    textAlign: 'center',
    // Cabe la frase más larga sin salirse: una marca cortada por los bordes
    // parece un fallo de impresión.
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    color: '#B3261E',
    opacity: 0.11,
    letterSpacing: 4,
  },
});

/** El marco doble, que va detrás de todo y se repite en cada página. */
export function Marco() {
  return (
    <>
      <View style={base.marcoExterior} fixed />
      <View style={base.marcoInterior} fixed />
    </>
  );
}

export interface Emisor {
  organizationName: string;
  organizationAddress: string;
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
}

/** Quién emite, arriba a la izquierda; el folio del documento, en su caja. */
export function Membrete({
  emisor,
  etiqueta,
  folio,
}: {
  emisor: Emisor;
  etiqueta: string;
  folio: string;
}) {
  const contacto = [emisor.organizationPhone, emisor.organizationEmail].filter(Boolean).join(' · ');

  return (
    <View style={base.membrete}>
      <View style={base.emisor}>
        <Text style={base.emisorNombre}>{emisor.organizationName}</Text>
        {emisor.organizationAddress ? (
          <Text style={base.emisorDato}>{emisor.organizationAddress}</Text>
        ) : null}
        {contacto ? <Text style={base.emisorDato}>{contacto}</Text> : null}
      </View>
      <View style={base.caja}>
        <Text style={base.cajaEtiqueta}>{etiqueta}</Text>
        <Text style={base.cajaValor}>{folio}</Text>
      </View>
    </View>
  );
}

/** El nombre del documento, centrado y con su regla debajo. */
export function Titulo({ children, nota }: { children: string; nota?: string }) {
  return (
    <>
      <Text style={base.titulo}>{children}</Text>
      <View style={base.reglaTitulo} />
      {nota ? <Text style={base.subtitulo}>{nota}</Text> : null}
    </>
  );
}

export function Seccion({ children }: { children: string }) {
  return <Text style={base.seccion}>{children.toUpperCase()}</Text>;
}

export function Campo({ label, value }: { label: string; value: string }) {
  return (
    <View style={base.campo}>
      <Text style={base.etiqueta}>{label.toUpperCase()}</Text>
      <Text style={base.valor}>{value}</Text>
    </View>
  );
}

/** Un renglón de importe: concepto a la izquierda, cifra a la derecha. */
export function Renglon({
  concepto,
  importe,
  total = false,
}: {
  concepto: string;
  importe: string;
  total?: boolean;
}) {
  return (
    <View style={total ? base.renglonTotal : base.renglon}>
      {total ? <Text style={base.fuerte}>{concepto}</Text> : <Text>{concepto}</Text>}
      <Text style={total ? base.cifraFuerte : base.cifra}>{importe}</Text>
    </View>
  );
}

/**
 * El pie: quién lo emite, dónde se verifica y cuándo se generó esta copia.
 * Un documento sin fecha de emisión no se puede contrastar con otro.
 */
export function Pie({
  emisor,
  verifyUrl,
  issuedAtFormatted,
}: {
  emisor: Emisor;
  verifyUrl?: string | null | undefined;
  issuedAtFormatted: string;
}) {
  return (
    <View style={base.pie} fixed>
      {verifyUrl ? (
        <Text style={base.pieRenglon}>Verifica este documento en {verifyUrl}</Text>
      ) : null}
      <Text
        style={base.pieRenglon}
        render={({ pageNumber, totalPages }) =>
          // La numeración va siempre, aunque haya una sola hoja: es lo que
          // impide presentar media copia como si fuera el documento entero.
          [emisor.organizationName, emisor.organizationAddress]
            .filter(Boolean)
            .join(' · ') +
          ` · Emitido el ${issuedAtFormatted} · Hoja ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}
