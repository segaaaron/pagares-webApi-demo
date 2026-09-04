import 'server-only';
import { api } from '@/shared/api/client';

export interface DebtorSummary {
  id: string;
  fullName: string;
  address: string;
  phone: string;
  email: string | null;
  hasAccount: boolean;
}

/**
 * La ficha de un deudor, para partir de ella.
 *
 * Se usa al emitir desde su expediente: llegar allí y tener que volver a
 * buscarlo por nombre es teclear lo que el sistema ya sabe, y es donde se cuela
 * el pagaré emitido al deudor equivocado.
 */
export async function getDebtor(id: string): Promise<DebtorSummary | null> {
  try {
    return await api<DebtorSummary>(`/admin/debtors/${id}`);
  } catch {
    // Un identificador que ya no existe no debe impedir emitir: el formulario
    // se abre igual, sólo que en blanco.
    return null;
  }
}
