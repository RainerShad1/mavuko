// Mensajes que el colegio le envía a las familias: recibos, recordatorios, circulares.
import { COLEGIO } from './colegio.js';
import { estadoFam, mesLargo, rd, hoyRD, venceDe, mesActual } from './cobros.js';
import { enviar, enviarPlantilla, ventanaAbierta } from './wa.js';
import { leerConfig } from './db.js';

export async function hijosDe(db, famId) {
  return db.q('select id, familia_id as fam, nombre, grado, nivel from estudiantes where familia_id = $1 order by id', [famId]);
}

export async function pagadosDe(db, estIds) {
  if (!estIds.length) return new Set();
  const rows = await db.q('select estudiante_id, mes from pagos where estudiante_id = any($1::text[])', [estIds]);
  return new Set(rows.map((r) => r.estudiante_id + '|' + r.mes));
}

export async function estadoDeFamilia(db, famId, hoy = hoyRD()) {
  const hijos = await hijosDe(db, famId);
  const pagados = await pagadosDe(db, hijos.map((h) => h.id));
  return { hijos, pagados, ...estadoFam(hijos, pagados, hoy) };
}

export const primerNombre = (n) => String(n).split(' ')[0];

export function textoRecordatorio(f, s, tipo) {
  const nom = primerNombre(f.tutor);
  if (tipo === 'mora') {
    const meses = [...new Set(s.mesesMora.map((z) => mesLargo(z[1])))].join(', ');
    const hijos = [...new Set(s.mesesMora.map((z) => z[0].nombre))].join(' y ');
    return `⚠️ Hola, ${nom}. La cuenta de *${hijos}* tiene pendiente la mensualidad de *${meses}*.\nMonto pendiente: *${rd(s.mora)}*\nPuede pagar en la secretaría o por transferencia y enviarnos el comprobante por aquí. Si ya pagó, ignore este mensaje.`;
  }
  const hijos = [...new Set(s.mesesPend.map((z) => z[0].nombre))].join(' y ');
  const k = s.mesesPend[0][1];
  return `🔔 Hola, ${nom}. Le recordamos que la mensualidad de *${mesLargo(k)}* de *${hijos}* vence el *${venceDe(k).slice(8)}/${k.slice(5)}*.\nMonto: *${rd(s.pend)}*\nResponda *MENÚ* para ver su estado de cuenta o enviar su comprobante.`;
}

export function textoRecibo(f, e, r) {
  return `✅ Hola, ${primerNombre(f.tutor)}. Recibimos su pago de *${rd(r.total)}* por la mensualidad de *${r.meses.map(mesLargo).join(', ')}* de ${e.nombre}.\nRecibo: ${r.id}\n¡Gracias por mantenerse al día! 🙌`;
}

/**
 * Envía un mensaje del colegio a una familia y lo anota en "enviados".
 * - Modo demo: solo se envía de verdad a familias marcadas como reales; el resto queda "Simulado".
 * - Dentro de las 24 h desde el último mensaje del padre: mensaje normal (servicio).
 * - Fuera de la ventana: plantilla aprobada (WA_PLANTILLA_AVISO), si está configurada.
 */
export async function enviarAFamilia(env, db, f, texto, tipo, { rec = false } = {}) {
  const cfg = await leerConfig(db);
  let estado = 'Enviado', wamid = null, via = 'servicio', error = null;
  if (cfg.modoDemo && !f.real) {
    estado = 'Simulado';
  } else if (await ventanaAbierta(db, f.tel_wa)) {
    const r = await enviar(env, db, f.tel_wa, texto);
    wamid = r.wamid; if (r.simulado) estado = 'Simulado'; if (r.error) { estado = 'Falló'; error = r.error; }
  } else if (env.WA_PLANTILLA_AVISO) {
    via = 'plantilla';
    const r = await enviarPlantilla(env, db, f.tel_wa, env.WA_PLANTILLA_AVISO, env.WA_PLANTILLA_IDIOMA || 'es', [primerNombre(f.tutor), texto.replace(/\*/g, '')], texto);
    wamid = r.wamid; if (r.simulado) estado = 'Simulado'; if (r.error) { estado = 'Falló'; error = r.error; }
  } else {
    estado = 'Falló'; via = 'plantilla';
    error = 'Ventana de 24 h cerrada: hace falta una plantilla aprobada por Meta';
  }
  const hoy = new Date(Date.now() + COLEGIO.zonaHoraria * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('/');
  await db.q('insert into enviados(familia_id, tipo, estado, rec, wamid) values($1,$2,$3,$4,$5)', [f.id, tipo, estado, rec, wamid]);
  await db.q('update familias set ultimo_aviso = $2 where id = $1', [f.id, `${hoy} · ${tipo}`]);
  return { estado, via, error };
}

// Familias a las que toca recordatorio. auto=true aplica el calendario del envío automático.
export async function colaRecordatorios(db, { auto = false, hoy = hoyRD() } = {}) {
  const cfg = await leerConfig(db);
  if (!cfg.modRec) return [];
  const fams = await db.q('select * from familias order by id');
  const ests = await db.q('select id, familia_id as fam, nombre, grado, nivel from estudiantes');
  const pays = await db.q('select estudiante_id, mes from pagos');
  const yaHoy = new Set((await db.q("select familia_id from enviados where rec and fecha > now() - interval '20 hours'")).map((r) => r.familia_id));
  const pagados = new Set(pays.map((r) => r.estudiante_id + '|' + r.mes));
  const dia = Number(hoy.slice(8)), dv = COLEGIO.diaVence;
  const out = [];
  for (const f of fams) {
    if (yaHoy.has(f.id)) continue;
    const s = estadoFam(ests.filter((e) => e.fam === f.id), pagados, hoy);
    if (s.mora > 0 && cfg.rules.mora && (!auto || dia === dv + 3 || dia === dv + 10)) out.push({ f, s, tipo: 'mora' });
    else if (s.pend > 0) {
      const k = s.mesesPend[0][1];
      const faltan = Math.round((Date.parse(venceDe(k)) - Date.parse(hoy)) / 864e5);
      if (!auto && cfg.rules.previo) out.push({ f, s, tipo: 'previo' });
      else if (auto && ((cfg.rules.previo && faltan === 3) || (cfg.rules.dia && faltan === 0))) out.push({ f, s, tipo: 'previo' });
    }
  }
  return out;
}

export async function enviarRecordatorios(env, db, opts) {
  const cola = await colaRecordatorios(db, opts);
  const res = { total: cola.length, enviados: 0, simulados: 0, fallidos: 0 };
  for (const x of cola) {
    const r = await enviarAFamilia(env, db, x.f, textoRecordatorio(x.f, x.s, x.tipo), x.tipo === 'mora' ? 'Recordatorio de mora' : 'Aviso previo', { rec: true });
    if (r.estado === 'Simulado') res.simulados++; else if (r.estado === 'Falló') res.fallidos++; else res.enviados++;
  }
  return res;
}

export { COLEGIO };
