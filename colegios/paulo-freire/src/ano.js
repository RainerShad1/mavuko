// Becas y descuentos fijos, retiro de estudiantes y cierre del año escolar.
import { COLEGIO } from './colegio.js';
import { ANO, fijarAno, meses, nombreAno, tarifaEst, aplica, mesLargo, venceDe, hoyRD } from './cobros.js';
import { guardarConfig } from './db.js';

export const MOTIVOS_BECA = ['Hermanos', 'Hijo de empleado', 'Beca académica', 'Beca deportiva', 'Ayuda social', 'Otro'];
const GRADOS = COLEGIO.grados.map((g) => g[0]);
const nivelDe = (g) => (COLEGIO.grados.find((x) => x[0] === g) || [])[1];
const ultimoMes = () => meses().at(-1).k;
const anoTxt = (inicio = ANO.inicio) => nombreAno(inicio).replace('–', '-');

// ---------- Becas y descuentos ----------
export async function fijarBeca(db, id, d) {
  const e = await db.one('select * from estudiantes where id = $1', [id]);
  if (!e) throw new Error('Estudiante no encontrado');
  const pct = Math.round(Number(d.pct) || 0), monto = Math.round(Number(d.monto) || 0);
  if (pct < 0 || pct > 100) throw new Error('La beca debe estar entre 0 % y 100 %');
  if (monto < 0 || monto > (ANO.tarifas[e.nivel] || 0)) throw new Error('El descuento fijo no puede ser mayor que la mensualidad');
  const motivo = pct || monto ? (MOTIVOS_BECA.includes(d.motivo) ? d.motivo : 'Otro') : null;
  await db.q('update estudiantes set beca_pct = $2, beca_monto = $3, beca_motivo = $4 where id = $1', [id, pct, monto, motivo]);
  return { ok: true, mensualidad: tarifaEst({ ...e, beca_pct: pct, beca_monto: monto }) };
}

// ---------- Retiro a mitad de año ----------
// hasta = último mes que paga (por defecto el mes actual). Lo que deba hasta ese mes sigue pendiente.
export async function retirar(db, id, d) {
  const e = await db.one('select * from estudiantes where id = $1', [id]);
  if (!e) throw new Error('Estudiante no encontrado');
  if (e.estado !== 'activo') throw new Error('El estudiante ya no está activo');
  const ks = meses().map((m) => m.k);
  const hasta = ks.includes(d.hasta) ? d.hasta : null;
  if (!hasta) throw new Error('Elige el último mes que paga');
  if (e.desde && hasta < e.desde) throw new Error('El último mes no puede ser antes de su inscripción');
  const motivo = String(d.motivo || '').trim().slice(0, 120) || 'Retiro';
  // Meses pagados después del retiro: se avisa, no se borran (se resuelven con la factura)
  const pagosDespues = await db.q('select mes from pagos where estudiante_id = $1 and mes > $2 and mes = any($3::text[])', [id, hasta, ks]);
  await db.q("update estudiantes set estado = 'retirado', hasta = $2, baja_motivo = $3 where id = $1", [id, hasta, motivo]);
  return { ok: true, pagosDespues: pagosDespues.map((p) => p.mes) };
}

export async function reactivar(db, id) {
  const e = await db.one('select * from estudiantes where id = $1', [id]);
  if (!e) throw new Error('Estudiante no encontrado');
  await db.q("update estudiantes set estado = 'activo', hasta = null, baja_motivo = null where id = $1", [id]);
  return { ok: true };
}

// ---------- Cierre del año escolar ----------
// Lo que cada estudiante debe del año: solo meses ya vencidos. Si el año se cierra antes de tiempo,
// los meses que aún no vencen no se cobran.
async function deudasDelAno(db) {
  const ests = await db.q('select * from estudiantes order by id');
  const pays = new Set((await db.q('select estudiante_id, mes from pagos')).map((r) => r.estudiante_id + '|' + r.mes));
  const hoy = hoyRD();
  const ks = meses().map((m) => m.k).filter((k) => venceDe(k) < hoy);
  return ests.map((e) => {
    const t = tarifaEst(e);
    const debe = t ? ks.filter((k) => aplica(e, k) && !pays.has(e.id + '|' + k)) : [];
    return { e, meses: debe, monto: debe.length * t };
  });
}

function sugerencia(e) {
  if (e.estado !== 'activo') return e.estado;
  return e.grado === GRADOS.at(-1) ? 'egresado' : 'promovido';
}
const siguienteGrado = (g) => GRADOS[Math.min(GRADOS.length - 1, GRADOS.indexOf(g) + 1)];
const sumarAno = (inicio) => `${Number(inicio.slice(0, 4)) + 1}${inicio.slice(4)}`;

export async function resumenCierre(db) {
  const deudas = await deudasDelAno(db);
  const pendientes = await db.q("select id, cliente, items from facturas where estado = 'pendiente'");
  const ks = new Set(meses().map((m) => m.k));
  const bloqueo = pendientes.filter((f) => f.items.some((l) => l.est && ks.has(l.mes))).map((f) => ({ id: f.id, cliente: f.cliente }));
  return {
    ano: nombreAno(), inicio: ANO.inicio, ultimoMes: ultimoMes(),
    sinVencer: meses().map((m) => m.k).filter((k) => venceDe(k) >= hoyRD()),
    siguiente: { inicio: sumarAno(ANO.inicio), nombre: nombreAno(sumarAno(ANO.inicio)), tarifas: ANO.tarifas },
    grados: GRADOS,
    estudiantes: deudas.map(({ e, meses: ms, monto }) => ({
      id: e.id, fam: e.familia_id, nombre: e.nombre, grado: e.grado, estado: e.estado, beca: e.beca_pct || e.beca_monto ? true : false,
      sugerencia: sugerencia(e), siguienteGrado: siguienteGrado(e.grado), debe: monto, mesesDebe: ms,
    })),
    totalDeuda: deudas.reduce((a, x) => a + x.monto, 0),
    facturasPendientes: bloqueo,
  };
}

/**
 * Cierra el año: pasa las deudas a "saldos", aplica las decisiones (promovido, repite, egresado, retirado)
 * y abre el año nuevo con sus tarifas. No borra pagos, facturas ni historial.
 */
export async function cerrarAno(db, body, usuario) {
  if (body.confirmar !== 'CERRAR') throw new Error('Escribe CERRAR para confirmar');
  const inicio = String(body.inicio || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(inicio) || inicio <= ultimoMes()) throw new Error('El año nuevo debe empezar después del último mes del año actual');
  const tarifas = {};
  for (const n of Object.keys(ANO.tarifas)) {
    const v = Math.round(Number((body.tarifas || {})[n] ?? ANO.tarifas[n]));
    if (!(v > 0 && v < 1e6)) throw new Error(`Revisa la mensualidad de ${n}`);
    tarifas[n] = v;
  }
  const r = await resumenCierre(db);
  if (r.facturasPendientes.length) throw new Error(`Cobra o anula primero las facturas pendientes con mensualidades de este año: ${r.facturasPendientes.map((f) => f.id).join(', ')}`);
  const dec = body.decisiones || {};
  const ano = anoTxt(), fin = ultimoMes();
  const cuenta = { promovido: 0, repite: 0, egresado: 0, retirado: 0, saldos: 0, deuda: 0 };

  for (const { e, meses: ms, monto } of await deudasDelAno(db)) {
    if (monto > 0) {
      await db.q('insert into saldos(estudiante_id, familia_id, ano, meses, monto) values($1,$2,$3,$4,$5)', [e.id, e.familia_id, ano, ms, monto]);
      cuenta.saldos++; cuenta.deuda += monto;
    }
    if (e.estado !== 'activo') continue;
    let d = ['promovido', 'repite', 'egresado', 'retirado'].includes(dec[e.id]) ? dec[e.id] : sugerencia(e);
    if (d === 'promovido' && e.grado === GRADOS.at(-1)) d = 'egresado';
    cuenta[d]++;
    if (d === 'promovido') {
      const g = siguienteGrado(e.grado);
      await db.q('update estudiantes set grado = $2, nivel = $3 where id = $1', [e.id, g, nivelDe(g)]);
    } else if (d === 'egresado' || d === 'retirado') {
      await db.q('update estudiantes set estado = $2, hasta = coalesce(hasta, $3), baja_motivo = coalesce(baja_motivo, $4) where id = $1',
        [e.id, d, fin, d === 'egresado' ? `Egresado ${nombreAno()}` : `No continuó en ${nombreAno(inicio)}`]);
    }
  }
  // Todos empiezan el año nuevo desde el primer mes
  await db.q('update estudiantes set desde = null');
  if (!body.conservarBecas) await db.q('update estudiantes set beca_pct = 0, beca_monto = 0, beca_motivo = null');
  await db.q('insert into anos(inicio, usuario, resumen) values($1,$2,$3) on conflict (inicio) do update set cerrado_en = now(), usuario = excluded.usuario, resumen = excluded.resumen',
    [ANO.inicio, usuario || null, JSON.stringify({ ...cuenta, nombre: nombreAno(), tarifas: ANO.tarifas })]);
  await guardarConfig(db, 'ano', { inicio, tarifas });
  fijarAno({ inicio, tarifas });
  return { ok: true, cerrado: nombreAno(r.inicio), nuevo: nombreAno(inicio), ...cuenta };
}

export async function historialAnos(db) {
  return db.q('select inicio, cerrado_en, usuario, resumen from anos order by inicio desc');
}

export { mesLargo };
