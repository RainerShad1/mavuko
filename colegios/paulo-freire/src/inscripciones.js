// Inscripción de estudiantes nuevos y edición de los datos de familias y estudiantes.
import { COLEGIO } from './colegio.js';
import { nuevoId, telWA, telBonito } from './db.js';
import { meses, venceDe, hoyRD } from './cobros.js';
import { crearFactura, conceptos, textoFactura } from './facturas.js';
import { enviarAFamilia, primerNombre } from './avisos.js';

const PARENTESCOS = ['Madre', 'Padre', 'Tutor', 'Tutora', 'Abuelo', 'Abuela', 'Otro'];
const txt = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
const nivelDe = (grado) => (COLEGIO.grados.find((g) => g[0] === grado) || [])[1];

async function validarTel(db, tel, famId = null) {
  const t = telWA(tel);
  if (t.length !== 11 || t[0] !== '1') throw new Error('Escribe un teléfono dominicano de 10 dígitos');
  const otro = await db.one('select id, tutor from familias where tel_wa = $1 and id <> coalesce($2, \'\')', [t, famId]);
  if (otro) throw new Error(`Ese teléfono ya pertenece a la familia de ${otro.tutor}. Elige "Familia existente".`);
  return t;
}

function validarEstudiantes(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('Agrega al menos un estudiante');
  if (lista.length > 8) throw new Error('Demasiados estudiantes en una inscripción');
  return lista.map((e) => {
    const nombre = txt(e.nombre, 80), grado = txt(e.grado, 40);
    if (nombre.length < 3) throw new Error('Escribe el nombre completo de cada estudiante');
    const nivel = nivelDe(grado);
    if (!nivel) throw new Error(`Elige el grado de ${nombre}`);
    return { nombre, grado, nivel };
  });
}

/**
 * body: { fam?: id existente, familia?: {tutor, parentesco, tel, doc}, estudiantes: [{nombre, grado}],
 *         interesado?: id, cobrar?: bool, metodo?: 'Efectivo'|... ('' = pendiente), bienvenida?: bool }
 */
export async function inscribir(env, db, body, usuario, base) {
  const ests = validarEstudiantes(body.estudiantes);
  let f;
  if (body.fam) {
    f = await db.one('select * from familias where id = $1', [body.fam]);
    if (!f) throw new Error('Familia no encontrada');
  } else {
    const d = body.familia || {};
    const tutor = txt(d.tutor, 80);
    if (tutor.length < 3) throw new Error('Escribe el nombre del padre, madre o tutor');
    const parentesco = PARENTESCOS.includes(d.parentesco) ? d.parentesco : 'Tutor';
    const tel = await validarTel(db, d.tel);
    const doc = String(d.doc || '').replace(/[^\d-]/g, '').slice(0, 13) || null;
    const id = await nuevoId(db, 'F');
    await db.q('insert into familias(id, tutor, parentesco, tel, tel_wa, doc, real) values($1,$2,$3,$4,$5,$6,false)', [id, tutor, parentesco, telBonito(tel), tel, doc]);
    f = await db.one('select * from familias where id = $1', [id]);
  }
  // Mes desde el que paga: el que elija la secretaría; si no, el primero que todavía no ha vencido
  const ks = meses().map((x) => x.k);
  const desde = ks.includes(body.desde) ? body.desde : (ks.find((k) => venceDe(k) >= hoyRD()) || ks[ks.length - 1]);
  const nuevos = [];
  for (const e of ests) {
    const id = await nuevoId(db, 'E');
    await db.q('insert into estudiantes(id, familia_id, nombre, grado, nivel, desde) values($1,$2,$3,$4,$5,$6)', [id, f.id, e.nombre, e.grado, e.nivel, desde === ks[0] ? null : desde]);
    nuevos.push({ id, ...e });
  }
  if (body.interesado) await db.q("update interesados set estado = 'Inscrito' where id = $1", [body.interesado]);

  let factura = null, envio = null;
  if (body.cobrar) {
    const c = (await conceptos(db)).find((x) => /inscrip/i.test(x.n));
    const precio = c ? c.p : 0;
    factura = await crearFactura(db, {
      fam: f.id, usuario, pagada: !!body.metodo, metodo: body.metodo,
      lineas: nuevos.map((e) => ({ d: `Inscripción · ${e.nombre} (${e.grado})`, cant: 1, precio })),
    });
  }
  if (body.bienvenida) {
    const hijos = nuevos.map((e) => e.nombre.split(' ')[0]).join(' y ');
    let t = `🎉 ¡Bienvenidos al *${COLEGIO.nombre}*, ${primerNombre(f.tutor)}! ${hijos} ya ${nuevos.length > 1 ? 'están inscritos' : 'está inscrito/a'}.\n\nPor este WhatsApp puede consultar su estado de cuenta, enviar comprobantes, reportar ausencias y recibir avisos del colegio. Escriba *MENÚ* cuando lo necesite.`;
    if (factura) t += '\n\n' + textoFactura(factura, base);
    envio = await enviarAFamilia(env, db, f, t, 'Bienvenida');
  }
  return { fam: f.id, estudiantes: nuevos.map((e) => e.id), factura: factura && { id: factura.id, token: factura.token }, envio };
}

export async function editarFamilia(db, id, d) {
  const f = await db.one('select * from familias where id = $1', [id]);
  if (!f) throw new Error('Familia no encontrada');
  const tutor = txt(d.tutor ?? f.tutor, 80);
  if (tutor.length < 3) throw new Error('El nombre del tutor es muy corto');
  const parentesco = PARENTESCOS.includes(d.parentesco) ? d.parentesco : f.parentesco;
  const tel = d.tel !== undefined ? await validarTel(db, d.tel, id) : f.tel_wa;
  const doc = d.doc !== undefined ? String(d.doc || '').replace(/[^\d-]/g, '').slice(0, 13) || null : f.doc;
  await db.q('update familias set tutor = $2, parentesco = $3, tel = $4, tel_wa = $5, doc = $6 where id = $1', [id, tutor, parentesco, telBonito(tel), tel, doc]);
  return { ok: true };
}

export async function editarEstudiante(db, id, d) {
  const e = await db.one('select * from estudiantes where id = $1', [id]);
  if (!e) throw new Error('Estudiante no encontrado');
  const [x] = validarEstudiantes([{ nombre: d.nombre ?? e.nombre, grado: d.grado ?? e.grado }]);
  await db.q('update estudiantes set nombre = $2, grado = $3, nivel = $4 where id = $1', [id, x.nombre, x.grado, x.nivel]);
  return { ok: true };
}
