// Datos de prueba para la demostración. Los teléfonos usan el rango 555-01XX,
// reservado para ficción en el plan de numeración (no pertenecen a nadie).
import { COLEGIO } from './colegio.js';
import { meses, venceDe, hoyRD } from './cobros.js';

// Contactos reales para probar el asistente (reciben mensajes aunque el modo demo esté activo)
export const PRUEBA = [
  { tutor: 'Karolin', parentesco: 'Madre', tel: '849-653-8063', perfil: 'atr1', hijos: [['Mía', '2.º Primaria', 'Primaria'], ['Joel', '1.º Secundaria', 'Secundaria']] },
  { tutor: 'Fátima', parentesco: 'Madre', tel: '809-752-7776', perfil: 'norm', hijos: [['Valeria', 'Pre-primario', 'Inicial']] },
  { tutor: 'Damián Morales', parentesco: 'Padre', tel: '809-842-2800', perfil: 'punt', hijos: [['Lucas Morales', '4.º Primaria', 'Primaria']] },
];

export function generarDatos(hoy = hoyRD()) {
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(r() * a.length)];
  const nomM = ['María', 'Ana', 'Yokasta', 'Carmen', 'Rosanna', 'Luisa', 'Miguelina', 'Yuleisy', 'Altagracia', 'Patricia', 'Wendy', 'Mercedes', 'Katherine', 'Esther', 'Lorena', 'Yesenia'];
  const nomP = ['José', 'Juan', 'Ramón', 'Luis', 'Rafael', 'Pedro', 'Francisco', 'Wilson', 'Manuel', 'Héctor', 'Julio', 'Ángel'];
  const ape = ['Pérez', 'Rodríguez', 'Martínez', 'Santana', 'Reyes', 'Castillo', 'Mejía', 'Rosario', 'Jiménez', 'De la Cruz', 'Guzmán', 'Familia', 'Peña', 'Mercedes', 'Cedeño', 'Rijo', 'Báez', 'Polanco', 'Del Rosario', 'Núñez', 'Carpio', 'Mota', 'Ozuna', 'Valdez'];
  const kid = ['Luis', 'Sofía', 'Ángel', 'Camila', 'Daniel', 'Valentina', 'Samuel', 'Isabella', 'Adrián', 'Mía', 'Gabriel', 'Ashley', 'Joel', 'Nicole', 'Jesús', 'Paola', 'Emmanuel', 'Génesis', 'Johan', 'Ariana', 'Diego', 'Brianna', 'Kevin', 'Alondra', 'Elián', 'Yaritza', 'Josué', 'Melany', 'Rubén', 'Hillary'];
  const fams = [], ests = [], pagos = [];
  let kidI = 0, rec = 1040;
  const perfiles = ['punt', 'punt', 'punt', 'norm', 'norm', 'norm', 'norm', 'atr1', 'atr1', 'atr2'];
  const pref = ['809', '829', '849'];
  for (let i = 0; i < 30; i++) {
    const ap = ape[i % ape.length] + (i >= ape.length ? ' ' + pick(ape) : '');
    const madre = r() < 0.72;
    const tel = `${pref[i % 3]}-555-01${String(i + 10).padStart(2, '0')}`;
    fams.push({ id: 'F' + (i + 1), tutor: (madre ? pick(nomM) : pick(nomP)) + ' ' + ap, parentesco: madre ? 'Madre' : 'Padre', tel, tel_wa: '1' + tel.replace(/\D/g, ''), perfil: perfiles[i % perfiles.length] });
    const n = r() < 0.3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const g = COLEGIO.grados[Math.floor(r() * COLEGIO.grados.length)];
      ests.push({ id: 'E' + (ests.length + 1), familia_id: 'F' + (i + 1), nombre: kid[kidI++ % kid.length] + ' ' + ap.split(' ')[0], grado: g[0], nivel: g[1] });
    }
  }
  for (const c of PRUEBA) {
    const id = 'F' + (fams.length + 1);
    fams.push({ id, tutor: c.tutor, parentesco: c.parentesco, tel: c.tel, tel_wa: '1' + c.tel.replace(/\D/g, ''), perfil: c.perfil, real: true });
    for (const [nombre, grado, nivel] of c.hijos) ests.push({ id: 'E' + (ests.length + 1), familia_id: id, nombre, grado, nivel });
  }
  // Hasta qué mes pagó cada perfil: puntual = el próximo que vence, normal = uno menos, etc.
  const ms = meses().map((m) => m.k);
  const idxProx = Math.max(0, ms.findIndex((k) => venceDe(k) >= hoy));
  const hasta = { punt: idxProx, norm: idxProx - 1, atr1: idxProx - 2, atr2: idxProx - 3 };
  for (const e of ests) {
    const f = fams.find((x) => x.id === e.familia_id);
    ms.forEach((k, i) => {
      if (i > hasta[f.perfil]) return;
      const v = Date.parse(venceDe(k) + 'T12:00:00Z');
      let d = v - Math.floor(r() * 9) * 864e5;
      if (d > Date.parse(hoy + 'T12:00:00Z')) d = Date.parse(hoy + 'T12:00:00Z') - Math.floor(1 + r() * 4) * 864e5;
      pagos.push({ recibo: 'R-' + rec++, estudiante_id: e.id, mes: k, monto: COLEGIO.tarifas[e.nivel], fecha: new Date(d).toISOString(), metodo: pick(['Efectivo', 'Efectivo', 'Transferencia', 'Transferencia', 'Tarjeta']), ref: '' });
    });
  }
  const interesados = [
    { id: 'I1', nombre: 'Carolina Batista', tel: '829-555-0142', grado: 'Inicial', fecha: new Date(Date.now() - 864e5).toISOString(), estado: 'Nuevo' },
    { id: 'I2', nombre: 'Ramón Encarnación', tel: '809-555-0177', grado: 'Secundaria', fecha: new Date(Date.now() - 3 * 864e5).toISOString(), estado: 'Contactado' },
  ];
  return { fams, ests, pagos, interesados, rec };
}

// Borra todo (menos usuarios) y vuelve a cargar los datos de prueba.
export async function sembrar(db, hoy) {
  const d = generarDatos(hoy);
  await db.q('truncate familias, estudiantes, pagos, comprobantes, ausencias, citas, humano, interesados, circulares, enviados, mensajes, wa_sesiones restart identity cascade');
  await db.q("insert into familias(id, tutor, parentesco, tel, tel_wa, real) select id, tutor, parentesco, tel, tel_wa, coalesce(real, false) from jsonb_to_recordset($1::jsonb) as x(id text, tutor text, parentesco text, tel text, tel_wa text, real boolean)", [JSON.stringify(d.fams)]);
  await db.q('insert into estudiantes(id, familia_id, nombre, grado, nivel) select * from jsonb_to_recordset($1::jsonb) as x(id text, familia_id text, nombre text, grado text, nivel text)', [JSON.stringify(d.ests)]);
  await db.q('insert into pagos(recibo, estudiante_id, mes, monto, fecha, metodo, ref) select * from jsonb_to_recordset($1::jsonb) as x(recibo text, estudiante_id text, mes text, monto int, fecha timestamptz, metodo text, ref text)', [JSON.stringify(d.pagos)]);
  await db.q('insert into interesados(id, nombre, tel, grado, fecha, estado) select * from jsonb_to_recordset($1::jsonb) as x(id text, nombre text, tel text, grado text, fecha timestamptz, estado text)', [JSON.stringify(d.interesados)]);
  await db.q(`select setval('sec_recibo', $1)`, [d.rec]);
  await db.q(`select setval('sec_id', 100)`);
  // Unos ejemplos de lo que llega por WhatsApp
  const debe = d.fams.filter((f) => f.perfil === 'norm').slice(0, 2);
  for (const [i, f] of debe.entries()) {
    const e = d.ests.find((x) => x.familia_id === f.id);
    const prox = meses().map((m) => m.k).find((k) => !d.pagos.some((p) => p.estudiante_id === e.id && p.mes === k));
    await db.q('insert into comprobantes(id, familia_id, estudiante_id, meses, monto, banco, ref, fecha) values($1,$2,$3,$4,$5,$6,$7,$8)',
      ['C' + (i + 1), f.id, e.id, [prox], COLEGIO.tarifas[e.nivel], ['Banreservas', 'Banco Popular'][i], String(48000000 + i * 7919), new Date(Date.now() - (i ? 20 : 2.5) * 3600e3).toISOString()]);
  }
  await db.q('insert into ausencias(id, estudiante_id, familia_id, motivo) values($1,$2,$3,$4)', ['A1', d.ests[3].id, d.ests[3].familia_id, 'Enfermedad']);
  await db.q('insert into citas(id, familia_id, con, dia, hora) values($1,$2,$3,$4,$5)', ['T1', d.fams[5].id, 'Orientación', 'Próxima semana', '10:00 a. m.']);
  return { familias: d.fams.length, estudiantes: d.ests.length, pagos: d.pagos.length };
}
