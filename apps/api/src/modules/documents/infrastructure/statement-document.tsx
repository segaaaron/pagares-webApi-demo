import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { base, FONDO, GRIS, Membrete, Marco, Pie, REGLA, Seccion, Titulo } from './documento-base.js';

export interface StatementNote {
  folio: string;
  issueDate: string;
  dueDate: string;
  amount: string;
  paid: string;
  balance: string;
  statusLabel: string;
  /** Días de atraso al corte: es lo que decide a quién se llama primero. */
  daysOverdue?: number;
}

export interface StatementModel {
  statementFolio: string;
  organizationName: string;
  organizationAddress: string;
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
  debtorName: string;
  debtorPhone?: string | null | undefined;
  cutoffFormatted: string;
  notes: StatementNote[];
  totalAmount?: string;
  totalBalance: string;
  totalPaid: string;
  overdueCount?: number;
  overdueBalance?: string;
  issuedAtFormatted?: string;
  verifyUrl?: string | null | undefined;
}

/**
 * Estado de cuenta a una fecha de corte (§17.1).
 *
 * Es lo que contesta «¿cuánto debo en total?» sin sumar doce pagarés a mano, así
 * que empieza por el resumen y sólo después baja al detalle: quien lo abre
 * quiere una cifra, no una tabla.
 */
const s = StyleSheet.create({
  resumen: { flexDirection: 'row', gap: 10, marginTop: 4 },
  tarjeta: { flex: 1, backgroundColor: FONDO, paddingHorizontal: 10, paddingVertical: 8 },
  tarjetaEtiqueta: { fontSize: 6.5, color: GRIS, letterSpacing: 0.8 },
  tarjetaValor: { fontSize: 13, fontFamily: 'Courier-Bold', marginTop: 3 },

  cabecera: {
    flexDirection: 'row',
    borderBottomWidth: 0.8,
    borderBottomColor: '#101A16',
    paddingBottom: 4,
  },
  fila: {
    flexDirection: 'row',
    paddingVertical: 4.5,
    borderBottomWidth: 0.4,
    borderBottomColor: REGLA,
  },
  th: { fontSize: 6.5, color: GRIS, letterSpacing: 0.6 },
  // Los anchos suman 100: con 108 el saldo y el estado se pisaban y salía
  // «$6,027.73 MXNPor firmar».
  folio: { width: '21%', fontFamily: 'Courier', fontSize: 7.5 },
  fecha: { width: '11%', fontSize: 7.5 },
  dinero: { width: '16%', textAlign: 'right', fontFamily: 'Courier', fontSize: 7.5, paddingRight: 6 },
  estado: { width: '13%', fontSize: 7.5 },
  thDinero: { width: '16%', textAlign: 'right', paddingRight: 6 },
  vacio: { textAlign: 'center', color: GRIS, marginTop: 24, fontSize: 9 },
});

export function StatementDocument({ model }: { model: StatementModel }) {
  return (
    <Document title={`Estado de cuenta ${model.statementFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={base.page}>
        <Marco />
        <Membrete emisor={model} etiqueta="ESTADO DE CUENTA" folio={model.statementFolio} />

        <Titulo nota={`Al corte del ${model.cutoffFormatted}`}>ESTADO DE CUENTA</Titulo>

        <View style={base.fila}>
          <View style={base.campo}>
            <Text style={base.etiqueta}>DEUDOR</Text>
            <Text style={base.valor}>{model.debtorName}</Text>
          </View>
          {model.debtorPhone ? (
            <View style={base.campo}>
              <Text style={base.etiqueta}>TELÉFONO</Text>
              <Text style={base.valor}>{model.debtorPhone}</Text>
            </View>
          ) : null}
        </View>

        {/* El resumen primero: quien abre esto quiere una cifra, no una tabla. */}
        <Seccion>Resumen</Seccion>
        <View style={s.resumen}>
          <View style={s.tarjeta}>
            <Text style={s.tarjetaEtiqueta}>SALDO TOTAL</Text>
            <Text style={s.tarjetaValor}>{model.totalBalance}</Text>
          </View>
          <View style={s.tarjeta}>
            <Text style={s.tarjetaEtiqueta}>ABONADO</Text>
            <Text style={s.tarjetaValor}>{model.totalPaid}</Text>
          </View>
          {model.overdueBalance ? (
            <View style={s.tarjeta}>
              <Text style={s.tarjetaEtiqueta}>
                VENCIDO{model.overdueCount ? ` · ${model.overdueCount}` : ''}
              </Text>
              <Text style={s.tarjetaValor}>{model.overdueBalance}</Text>
            </View>
          ) : null}
        </View>

        <Seccion>Detalle por pagaré</Seccion>
        <View style={s.cabecera} fixed>
          <Text style={[s.th, s.folio]}>FOLIO</Text>
          <Text style={[s.th, s.fecha]}>EXPEDIDO</Text>
          <Text style={[s.th, s.fecha]}>VENCE</Text>
          <Text style={[s.th, s.thDinero]}>IMPORTE</Text>
          <Text style={[s.th, s.thDinero]}>ABONADO</Text>
          <Text style={[s.th, s.thDinero]}>SALDO</Text>
          <Text style={[s.th, s.estado]}>ESTADO</Text>
        </View>

        {model.notes.length === 0 ? (
          <Text style={s.vacio}>No hay pagarés a nombre de este deudor al corte.</Text>
        ) : (
          model.notes.map((note) => (
            <View key={note.folio} style={s.fila} wrap={false}>
              <Text style={s.folio}>{note.folio}</Text>
              <Text style={s.fecha}>{note.issueDate}</Text>
              <Text style={s.fecha}>{note.dueDate}</Text>
              <Text style={s.dinero}>{note.amount}</Text>
              <Text style={s.dinero}>{note.paid}</Text>
              <Text style={s.dinero}>{note.balance}</Text>
              <Text style={s.estado}>
                {note.statusLabel}
                {note.daysOverdue && note.daysOverdue > 0 ? ` · ${note.daysOverdue} d` : ''}
              </Text>
            </View>
          ))
        )}

        <View style={base.renglonTotal}>
          <Text style={base.fuerte}>Saldo total al corte</Text>
          <Text style={base.cifraFuerte}>{model.totalBalance}</Text>
        </View>

        <Text style={base.nota}>
          Este estado de cuenta es informativo y refleja lo registrado al corte indicado. No
          sustituye a los pagarés: cada uno es un título independiente y se paga por separado. Si
          algo no coincide con tus comprobantes, avísanos antes de pagar.
        </Text>

        <Pie
          emisor={model}
          verifyUrl={model.verifyUrl}
          issuedAtFormatted={model.issuedAtFormatted ?? model.cutoffFormatted}
        />
      </Page>
    </Document>
  );
}
