// Acceso a la base de datos (Neon por HTTP).
// En las pruebas se inyecta otra implementación en env.__db.
import { neon } from '@neondatabase/serverless';

export function crearDB(env) {
  if (env.__db) return env.__db;
  if (!env.DATABASE_URL) throw new Error('Falta la variable DATABASE_URL');
  const sql = neon(env.DATABASE_URL);
  const q = (text, params = []) => sql.query(text, params);
  return {
    q,
    one: async (text, params) => (await q(text, params))[0] || null,
  };
}

export async function nuevoId(db, prefijo) {
  const r = await db.one("select nextval('sec_id') as n");
  return prefijo + r.n;
}

export async function nuevoRecibo(db) {
  const r = await db.one("select nextval('sec_recibo') as n");
  return 'R-' + r.n;
}

// Carga el año escolar en curso (inicio y tarifas) guardado en la configuración
export async function cargarAno(db) {
  const { fijarAno } = await import('./cobros.js');
  const r = await db.one("select valor from config where clave = 'ano'");
  fijarAno(r ? r.valor : null);
}

export async function leerConfig(db) {
  const rows = await db.q('select clave, valor from config');
  const c = { rules: { previo: true, dia: true, mora: true }, modRec: false, modCirc: false, modoDemo: true };
  for (const r of rows) c[r.clave] = r.valor;
  return c;
}

export async function guardarConfig(db, clave, valor) {
  await db.q(
    'insert into config(clave, valor) values($1, $2::jsonb) on conflict (clave) do update set valor = excluded.valor',
    [clave, JSON.stringify(valor)]
  );
}

// Normaliza un teléfono dominicano a como lo envía WhatsApp: 1 + 10 dígitos
export function telWA(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 10) return '1' + d;
  return d;
}
export function telBonito(t) {
  const d = telWA(t);
  if (d.length === 11 && d[0] === '1') return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return '+' + d;
}
