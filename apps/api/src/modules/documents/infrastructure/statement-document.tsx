import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface StatementNote {
  folio: string;
  issueDate: string;
  dueDate: string;
  amount: string;
  paid: string;
  balance: string;
  statusLabel: string;
}

export interface StatementModel {
  statementFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  cutoffFormatted: string;
  notes: StatementNote[];
  totalBalance: string;
  totalPaid: string;
}

/** Estado de cuenta a una fecha de corte (§17.1). */
const s = StyleSheet.create({
  page: { paddingHorizontal: 40, paddingVertical: 40, fontSize: 9, color: '#121B17' },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: '#0B5340', textTransform: 'uppercase' },
  title: { fontSize: 16, marginTop: 6 },
  meta: { fontSize: 9, color: '#6A7A71', marginTop: 4, marginBottom: 20 },
  head: { flexDirection: 'row', backgroundColor: '#E8EDE9', paddingVertical: 6, paddingHorizontal: 6 },
  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#D2DAD4' },
  th: { fontSize: 7.5, color: '#39473F', textTransform: 'uppercase', letterSpacing: 0.5 },
  folio: { width: '18%' },
  date: { width: '14%' },
  money: { width: '16%', textAlign: 'right' },
  status: { width: '16%' },
  totals: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18, gap: 24 },
  totalLabel: { fontSize: 9, color: '#6A7A71' },
  totalValue: { fontSize: 12 },
  footer: { position: 'absolute', bottom: 26, left: 40, right: 40, fontSize: 7, color: '#6A7A71' },
});

export function StatementDocument({ model }: { model: StatementModel }) {
  return (
    <Document title={`Estado de cuenta ${model.statementFolio}`} author={model.organizationName}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.eyebrow}>Estado de cuenta</Text>
        <Text style={s.title}>{model.debtorName}</Text>
        <Text style={s.meta}>
          {model.statementFolio} · Al corte del {model.cutoffFormatted}
        </Text>

        <View style={s.head}>
          <Text style={[s.th, s.folio]}>Folio</Text>
          <Text style={[s.th, s.date]}>Expedido</Text>
          <Text style={[s.th, s.date]}>Vence</Text>
          <Text style={[s.th, s.money]}>Importe</Text>
          <Text style={[s.th, s.money]}>Abonado</Text>
          <Text style={[s.th, s.money]}>Saldo</Text>
          <Text style={[s.th, s.status]}>Estado</Text>
        </View>

        {model.notes.map((note) => (
          <View key={note.folio} style={s.row}>
            <Text style={s.folio}>{note.folio}</Text>
            <Text style={s.date}>{note.issueDate}</Text>
            <Text style={s.date}>{note.dueDate}</Text>
            <Text style={s.money}>{note.amount}</Text>
            <Text style={s.money}>{note.paid}</Text>
            <Text style={s.money}>{note.balance}</Text>
            <Text style={s.status}>{note.statusLabel}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View>
            <Text style={s.totalLabel}>Total abonado</Text>
            <Text style={s.totalValue}>{model.totalPaid}</Text>
          </View>
          <View>
            <Text style={s.totalLabel}>Saldo total</Text>
            <Text style={s.totalValue}>{model.totalBalance}</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          {model.organizationName} · {model.organizationAddress}
        </Text>
      </Page>
    </Document>
  );
}
