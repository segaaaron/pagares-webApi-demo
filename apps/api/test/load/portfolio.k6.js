import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * Carga de §22.1: 100 usuarios concurrentes, 30 minutos, sin degradación.
 *
 * Los umbrales son los objetivos de servicio del plan, no una cifra bonita: si
 * el p95 de lectura pasa de 300 ms o el de escritura de 600 ms, k6 termina en
 * rojo. Se separan las dos métricas porque una escritura y una lista no compiten
 * por lo mismo, y promediarlas esconde justo lo que hay que ver.
 *
 *   API_URL=http://localhost:3001/api/v1 k6 run apps/api/test/load/portfolio.k6.js
 *   DURATION=2m VUS=20 k6 run ...            # humo local
 */
const API = __ENV.API_URL || 'http://localhost:3001/api/v1';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@pagares.local';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Demo-Pagares-2026';

const readLatency = new Trend('lectura_ms', true);
const writeLatency = new Trend('escritura_ms', true);

export const options = {
  vus: Number(__ENV.VUS || 100),
  duration: __ENV.DURATION || '30m',
  thresholds: {
    // Los objetivos de §22.1, tal cual.
    'lectura_ms': ['p(95)<300'],
    'escritura_ms': ['p(95)<600'],
    checks: ['rate>0.99'],
    // Saturación del pool: se vería aquí antes que en la latencia media.
    http_req_failed: ['rate<0.01'],
  },
};

/** Cada usuario virtual abre su sesión una vez y la reutiliza, como el panel. */
export function setup() {
  const response = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(response, { 'el administrador entra': (r) => r.status === 200 });
  const token = response.json('accessToken');

  // Un pagaré vivo para leer su detalle: si la base está sembrada, hay quince.
  const list = http.get(`${API}/admin/notes?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const notes = list.json('data') || [];

  /*
   * Un pagaré anulado o renovado no tiene liquidación que calcular y la API
   * responde 400 a propósito. Meterlos en el reparto convertía ese 400 legítimo
   * en un 10 % de "fallos" que tapaba los fallos de verdad.
   */
  const SIN_LIQUIDACION = ['VOID', 'RENEWED'];
  const simulables = notes.filter((note) => !SIN_LIQUIDACION.includes(note.status));

  return {
    token,
    noteIds: notes.map((note) => note.id),
    simulableIds: simulables.map((note) => note.id),
  };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // Lectura: el listado es la pantalla que más se abre (§19.3).
  const list = http.get(`${API}/admin/notes?limit=25`, { headers, tags: { kind: 'read' } });
  readLatency.add(list.timings.duration);
  check(list, { 'listado responde 200': (r) => r.status === 200 });

  if (data.noteIds.length > 0) {
    const id = data.noteIds[Math.floor(Math.random() * data.noteIds.length)];

    const detail = http.get(`${API}/admin/notes/${id}`, { headers, tags: { kind: 'read' } });
    readLatency.add(detail.timings.duration);
    check(detail, { 'detalle responde 200': (r) => r.status === 200 });
  }

  if (data.simulableIds.length > 0) {
    // El simulador recalcula interés en cada llamada: es la lectura más caliente.
    const id = data.simulableIds[Math.floor(Math.random() * data.simulableIds.length)];
    const simulate = http.get(`${API}/admin/notes/${id}/simulate`, {
      headers,
      tags: { kind: 'read' },
    });
    readLatency.add(simulate.timings.duration);
    check(simulate, { 'simulador responde 200': (r) => r.status === 200 });
  }

  // Escritura: la bandeja de trabajo y la cartera se leen mucho más de lo que se
  // escribe, así que una de cada diez iteraciones registra actividad.
  if (data.noteIds.length > 0 && Math.random() < 0.1) {
    const id = data.noteIds[Math.floor(Math.random() * data.noteIds.length)];
    const activity = http.post(
      `${API}/admin/notes/${id}/activities`,
      JSON.stringify({ type: 'CALL', outcome: 'NO_ANSWER', notes: 'Prueba de carga' }),
      { headers, tags: { kind: 'write' } },
    );
    writeLatency.add(activity.timings.duration);
    check(activity, { 'gestión registrada': (r) => r.status === 201 || r.status === 200 });
  }

  const queue = http.get(`${API}/admin/reports/work-queue`, { headers, tags: { kind: 'read' } });
  readLatency.add(queue.timings.duration);
  check(queue, { 'bandeja responde 200': (r) => r.status === 200 });

  sleep(1);
}
