// Reglas de cobro: qué meses están pagados, vencidos o por vencer.
// La misma lógica está copiada en public/panel/app.js (función estadoEst).
import { COLEGIO } from './colegio.js';

const ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fecha y hora "de pared" en República Dominicana (usar getUTC*)
export const ahoraRD = (ms = Date.now()) => new Date(ms + COLEGIO.zonaHoraria * 3600e3);
export const hoyRD = (ms) => ahoraRD(ms).toISOString().slice(0, 10);
export const mesActual = (ms) => hoyRD(ms).slice(0, 7);
export const horaRD = (ms) => ahoraRD(ms).toISOString().slice(11, 16);

// Año escolar en curso y sus tarifas. Se guardan en la base de datos (config "ano")
// y se cargan al inicio de cada solicitud con fijarAno(); al cerrar el año cambian.
export const ANO = { inicio: COLEGIO.inicioAno, tarifas: { ...COLEGIO.tarifas } };
export function fijarAno(c) {
  ANO.inicio = (c && /^\d{4}-\d{2}$/.test(c.inicio)) ? c.inicio : COLEGIO.inicioAno;
  ANO.tarifas = { ...COLEGIO.tarifas, ...((c && c.tarifas) || {}) };
}
// "2026–2027"
export const nombreAno = (inicio = ANO.inicio) => { const y = Number(inicio.slice(0, 4)); return `${y}–${y + 1}`; };

// Mensualidad de un estudiante: tarifa de su nivel menos su beca (%) y su descuento fijo (RD$)
export function tarifaEst(est) {
  const base = ANO.tarifas[est.nivel] || 0;
  const pct = Math.min(100, Math.max(0, Number(est.beca_pct) || 0));
  return Math.max(0, Math.round(base * (1 - pct / 100)) - Math.max(0, Number(est.beca_monto) || 0));
}

export function meses() {
  let [y, m] = ANO.inicio.split('-').map(Number);
  const out = [];
  for (let i = 0; i < COLEGIO.mesesAno; i++) {
    out.push({ k: `${y}-${String(m).padStart(2, '0')}`, abrev: ABREV[m - 1], largo: LARGO[m - 1] });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
export const mesLargo = (k) => LARGO[Number(k.slice(5, 7)) - 1];
export const venceDe = (k) => `${k}-${String(COLEGIO.diaVence).padStart(2, '0')}`;
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

export function estadoEst(est, pagados, hoy = hoyRD()) {
  const vencidos = [], porVencer = [];
  if (tarifaEst(est) === 0) return { vencidos, porVencer }; // beca completa
  for (const { k } of meses()) {
    if (pagados.has(est.id + '|' + k) || !aplica(est, k)) continue;
    const v = venceDe(k);
    if (v < hoy) vencidos.push(k);
    else if (dias(hoy, v) <= 31) porVencer.push(k);
  }
  return { vencidos, porVencer };
}

// saldos: deudas de años anteriores sin pagar ({estudiante_id, monto, ano})
export function estadoFam(hijos, pagados, hoy = hoyRD(), saldos = []) {
  let mora = 0, pend = 0;
  const mesesMora = [], mesesPend = [];
  const ids = new Set(hijos.map((h) => h.id));
  const misSaldos = saldos.filter((x) => ids.has(x.estudiante_id) && !x.pagado);
  const saldoAnt = misSaldos.reduce((a, x) => a + x.monto, 0);
  mora += saldoAnt;
  for (const h of hijos) {
    const s = estadoEst(h, pagados, hoy);
    const t = tarifaEst(h);
    mora += s.vencidos.length * t; pend += s.porVencer.length * t;
    s.vencidos.forEach((m) => mesesMora.push([h, m]));
    s.porVencer.forEach((m) => mesesPend.push([h, m]));
  }
  return { mora, pend, st: mora > 0 ? 'bad' : pend > 0 ? 'warn' : 'ok', mesesMora, mesesPend, saldoAnt, saldos: misSaldos };
}

// Meses que le tocan a un estudiante: desde su inscripción (desde) hasta su retiro o egreso (hasta)
export const aplica = (est, k) => (!est.desde || k >= est.desde) && (!est.hasta || k <= est.hasta);

export const rd = (n) => 'RD$' + Number(n).toLocaleString('en-US');
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
