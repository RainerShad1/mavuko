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

export function meses() {
  let [y, m] = COLEGIO.inicioAno.split('-').map(Number);
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
  for (const { k } of meses()) {
    if (pagados.has(est.id + '|' + k) || !aplica(est, k)) continue;
    const v = venceDe(k);
    if (v < hoy) vencidos.push(k);
    else if (dias(hoy, v) <= 31) porVencer.push(k);
  }
  return { vencidos, porVencer };
}

export function estadoFam(hijos, pagados, hoy = hoyRD()) {
  let mora = 0, pend = 0;
  const mesesMora = [], mesesPend = [];
  for (const h of hijos) {
    const s = estadoEst(h, pagados, hoy);
    const t = COLEGIO.tarifas[h.nivel];
    mora += s.vencidos.length * t; pend += s.porVencer.length * t;
    s.vencidos.forEach((m) => mesesMora.push([h, m]));
    s.porVencer.forEach((m) => mesesPend.push([h, m]));
  }
  return { mora, pend, st: mora > 0 ? 'bad' : pend > 0 ? 'warn' : 'ok', mesesMora, mesesPend };
}

// Un estudiante inscrito con el año empezado no debe los meses anteriores a su inscripción
export const aplica = (est, k) => !est.desde || k >= est.desde;

export const rd = (n) => 'RD$' + Number(n).toLocaleString('en-US');
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
