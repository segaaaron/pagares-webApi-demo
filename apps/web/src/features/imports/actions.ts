'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'conflict';
}

export interface ImportResult {
  rows: number;
  valid: number;
  duplicates: number;
  issues: ImportIssue[];
  created: number | null;
  committed: boolean;
}

export interface ImportState {
  result?: ImportResult;
  error?: string;
  /** El CSV se conserva entre validar y confirmar: nadie vuelve a elegir el archivo. */
  csv?: string;
}

const MAX_BYTES = 2_000_000;

/**
 * Importación de cartera en dos pasos (§24.5).
 *
 * El primer envío **valida**: el servidor devuelve errores y conflictos sin
 * escribir nada. El segundo confirma. Se hace así porque el archivo lo teclea
 * alguien a mano en Excel, y la primera versión siempre trae una fecha al revés.
 */
export async function importCsvAction(
  kind: 'debtors' | 'notes',
  prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  // Revisar o importar lo dice el botón pulsado, no una acción distinta: con dos
  // acciones el panel llevaba dos estados para el mismo archivo y uno pisaba al
  // otro al re-renderizar.
  const commit = String(formData.get('commit') ?? '') === 'on';
  const csv = await readCsv(formData, prev);
  if (!csv) return { error: 'Elige un archivo CSV.' };
  if (csv.length > MAX_BYTES) {
    return { error: 'El archivo es demasiado grande: pártelo en dos.' };
  }

  try {
    const result = await api<ImportResult>(`/admin/imports/${kind}`, {
      method: 'POST',
      // Confirmar es lo que escribe: sin clave, un reintento de red duplicaría
      // media cartera (§12.4).
      idempotencyKey: randomUUID(),
      body: { csv, commit },
    });

    if (result.committed) {
      revalidatePath(kind === 'debtors' ? '/clientes' : '/pagares');
    }
    return { result, csv };
  } catch (error) {
    if (error instanceof ApiError) {
      return { csv, error: error.problem?.title ?? 'No se pudo procesar el archivo.' };
    }
    throw error;
  }
}

async function readCsv(formData: FormData, prev: ImportState): Promise<string | null> {
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) return file.text();
  // En el paso de confirmar no se vuelve a subir el archivo: se reusa el texto
  // que ya se validó, para que lo confirmado sea exactamente lo revisado.
  return prev.csv ?? null;
}
