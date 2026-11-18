// API del panel administrativo (requiere sesión iniciada).
import { COLEGIO } from './colegio.js';
import { meses, hoyRD, mesActual, ANO, nombreAno } from './cobros.js';
import { fijarBeca, retirar, reactivar, resumenCierre, cerrarAno, historialAnos, MOTIVOS_BECA } from './ano.js';
import { leerConfig, guardarConfig, nuevoId, nuevoRecibo, telWA, telBonito } from './db.js';
import { enviar, ventanaAbierta, VENTANA } from './wa.js';
import { enviarAFamilia, enviarRecordatorios, colaRecordatorios, primerNombre } from './avisos.js';
import { sembrar } from './seed.js';
import { apiContenido } from './contenido.js';
import { inscribir, editarFamilia, editarEstudiante } from './inscripciones.js';
import { crearFactura, cobrarFactura, anularFactura, facturaJSON, textoFactura, conceptos, baseURL, urlFactura, METODOS } from './facturas.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const err = (msg, status = 400) => json({ error: msg }, status);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const horaDe = (d) => new Date(new Date(d).getTime() + COLEGIO.zonaHoraria * 3600e3).toISOString().slice(11, 16);

export async function estado(env, db, user) {
  const [cfg, fams, ests, pays, comps, aus, citas, hum, ints, circs, sent, lastIn, esperando, facRec, saldos] = await Promise.all([
    leerConfig(db),
    db.q('select * from familias order by id'),
    db.q('select * from estudiantes order by id'),
    db.q('select * from pagos order by fecha'),
    db.q('select id, familia_id, estudiante_id, meses, monto, banco, ref, fecha, estado, motivo, recibo, via, (imagen is not null) as img from comprobantes order by fecha'),
    db.q('select * from ausencias order by fecha'),
    db.q('select * from citas order by creado'),
    db.q('select * from humano order by fecha'),
    db.q('select * from interesados order by fecha'),
    db.q('select * from circulares order by fecha'),
    db.q("select e.*, f.tutor from enviados e join familias f on f.id = e.familia_id where e.fecha > now() - interval '7 days' order by e.fecha"),
    db.q("select f.id, max(m.fecha) as f from familias f join mensajes m on m.tel = f.tel_wa and m.dir = 'in' group by f.id"),
    // Conversaciones que pidieron una persona y aún no se marcan como atendidas
    db.q(`select h.tel, min(h.nombre) as nombre, max(m.fecha) as ult from humano h
          left join mensajes m on m.tel = h.tel and m.dir = 'in' where not h.ok group by h.tel`),
    db.q("select recibo, id, token from facturas where recibo is not null and estado <> 'anulada'"),
    db.q('select * from saldos where not pagado order by id'),
  ]);
  const hoyIni = Date.parse(hoyRD() + 'T00:00:00Z') - COLEGIO.zonaHoraria * 3600e3;
  return {
    user: { nombre: user.nombre, rol: user.rol },
    meta: {
      colegio: COLEGIO.nombre, whatsapp: COLEGIO.whatsapp, tarifas: ANO.tarifas, grados: COLEGIO.grados, ano: nombreAno(), anoInicio: ANO.inicio, motivosBeca: MOTIVOS_BECA,
      meses: meses(), hoy: hoyRD(), cur: mesActual(), diaVence: COLEGIO.diaVence, costoUtil: COLEGIO.costoUtil, costoMkt: COLEGIO.costoMkt,
      waConectado: !!(env.WA_TOKEN && env.WA_PHONE_ID), plantilla: !!env.WA_PLANTILLA_AVISO,
    },
    rules: cfg.rules, modRec: cfg.modRec, modCirc: cfg.modCirc, modoDemo: cfg.modoDemo,
    fams: fams.map((f) => ({ id: f.id, tutor: f.tutor, parent: f.parentesco, tel: f.tel, doc: f.doc, real: f.real, ultimoAviso: f.ultimo_aviso })),
    fac: Object.fromEntries(facRec.map((x) => [x.recibo, [x.id, x.token]])),
    stus: ests.map((e) => ({ id: e.id, fam: e.familia_id, nombre: e.nombre, grado: e.grado, nivel: e.nivel, desde: e.desde, hasta: e.hasta, estado: e.estado, baja: e.baja_motivo, beca_pct: e.beca_pct, beca_monto: e.beca_monto, beca_motivo: e.beca_motivo })),
    saldos: saldos.map((x) => ({ id: x.id, est: x.estudiante_id, fam: x.familia_id, ano: x.ano, meses: x.meses, monto: x.monto })),
    pays: pays.map((p) => ({ id: p.recibo, est: p.estudiante_id, mes: p.mes, monto: p.monto, fecha: iso(p.fecha), met: p.metodo, ref: p.ref })),
    comps: comps.map((c) => ({ id: c.id, fam: c.familia_id, est: c.estudiante_id, meses: c.meses, monto: c.monto, banco: c.banco, ref: c.ref, fecha: iso(c.fecha), estado: c.estado, motivo: c.motivo, recibo: c.recibo, via: c.via, img: c.img })),
    aus: aus.map((a) => ({ id: a.id, est: a.estudiante_id, fam: a.familia_id, motivo: a.motivo, fecha: iso(a.fecha), hora: horaDe(a.fecha), visto: a.visto })),
    citas: citas.map((c) => ({ id: c.id, fam: c.familia_id, con: c.con, dia: c.dia, hora: c.hora, estado: c.estado })),
    humano: hum.map((h) => ({ id: h.id, fam: h.familia_id, nombre: h.nombre, tel: h.tel, texto: h.texto, hora: horaDe(h.fecha), ok: h.ok })),
    ints: ints.map((i) => ({ id: i.id, nombre: i.nombre, tel: i.tel, grado: i.grado, fecha: iso(i.fecha), estado: i.estado })),
    circs: circs.map((c) => ({ id: c.id, tit: c.tit, msg: c.msg, dest: c.dest, n: c.n, costo: Number(c.costo), fecha: iso(c.fecha), prog: c.prog })),
    sent: sent.map((s) => ({ fam: s.familia_id, tutor: s.tutor, tipo: s.tipo, hora: horaDe(s.fecha), est: s.estado, rec: s.rec, hoy: s.rec && new Date(s.fecha).getTime() >= hoyIni })),
    lastIn: Object.fromEntries(lastIn.map((r) => [r.id, iso(r.f)])),
    esperando: esperando.map((e) => ({ tel: e.tel, nombre: e.nombre, ult: iso(e.ult) })),
  };
}

// Pago de mensualidades: se registra como una factura pagada
async function registrarPago(db, estId, mesesSel, met, ref, usuario) {
  const e = await db.one('select * from estudiantes where id = $1', [estId]);
  if (!e) throw new Error('Estudiante no encontrado');
  const orden = meses().map((m) => m.k);
  const ms = [...new Set(mesesSel)].filter((k) => orden.includes(k)).sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  if (!ms.length) throw new Error('Selecciona al menos un mes');
  const fac = await crearFactura(db, { fam: e.familia_id, lineas: ms.map((mes) => ({ est: e.id, mes })), metodo: met, ref, usuario });
  return { e, fac, r: { id: fac.recibo, total: fac.total, meses: ms, factura: fac.id, token: fac.token } };
}

export async function api(req, env, db, user, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api/, '');
  const m = req.method;
  const body = m === 'POST' ? await req.json().catch(() => ({})) : {};
  const base = env.PUBLIC_URL ? baseURL(env) : url.origin;
  let r;

  if (p === '/state' && m === 'GET') {
    // Primera vez en modo demo: cargar los datos de prueba
    const cfg = await leerConfig(db);
    if (cfg.modoDemo && !(await db.one('select 1 as x from familias limit 1'))) await sembrar(db, hoyRD());
    return json(await estado(env, db, user));
  }

  // ---- Página web y redes ----
  const c = await apiContenido(req, env, db, p, m, body, json, err);
  if (c) return c;

  // ---- Pagos ----
  if (p === '/pagos' && m === 'POST') {
    try {
      const { e, fac, r: rec } = await registrarPago(db, body.est, body.meses || [], body.met || 'Efectivo', body.ref, user.nombre);
      return json({ ...rec, est: e.id, texto: textoFactura(fac, base) });
    } catch (x) { return err(x.message); }
  }
  // Enviar un mensaje ya armado a una familia (recibo, estado de cuenta)
  if (p === '/enviar' && m === 'POST') {
    const f = await db.one('select * from familias where id = $1', [body.fam]);
    if (!f) return err('Familia no encontrada', 404);
    return json(await enviarAFamilia(env, db, f, String(body.texto || '').slice(0, 4000), String(body.tipo || 'Mensaje')));
  }

  // ---- Comprobantes ----
  if ((r = p.match(/^\/comprobantes\/([\w-]+)\/imagen$/)) && m === 'GET') {
    const c = await db.one('select mime, imagen from comprobantes where id = $1', [r[1]]);
    if (!c || !c.imagen) return new Response('Sin imagen', { status: 404 });
    const bin = Uint8Array.from(atob(c.imagen), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': c.mime || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
  }
  if ((r = p.match(/^\/comprobantes\/([\w-]+)\/aprobar$/)) && m === 'POST') {
    const c = await db.one('select * from comprobantes where id = $1', [r[1]]);
    if (!c || c.estado !== 'pend') return err('Comprobante no disponible');
    const pagados = new Set((await db.q('select mes from pagos where estudiante_id = $1', [c.estudiante_id])).map((x) => x.mes));
    const ms = c.meses.filter((k) => !pagados.has(k));
    if (!ms.length) return err('Esos meses ya figuran como pagados. Si el comprobante está duplicado, recházalo.');
    const { fac, r: rec } = await registrarPago(db, c.estudiante_id, ms, 'Transferencia', 'WhatsApp', user.nombre);
    const f = await db.one('select * from familias where id = $1', [c.familia_id]);
    const envio = await enviarAFamilia(env, db, f, textoFactura(fac, base), 'Factura ' + fac.id);
    await db.q("update comprobantes set estado = 'ok', recibo = $2, via = $3 where id = $1", [c.id, rec.id, envio.via]);
    return json({ recibo: rec, envio });
  }
  if ((r = p.match(/^\/comprobantes\/([\w-]+)\/rechazar$/)) && m === 'POST') {
    const c = await db.one('select * from comprobantes where id = $1', [r[1]]);
    if (!c || c.estado !== 'pend') return err('Comprobante no disponible');
    const motivo = String(body.motivo || 'No se pudo validar').slice(0, 120);
    await db.q("update comprobantes set estado = 'bad', motivo = $2 where id = $1", [c.id, motivo]);
    const f = await db.one('select * from familias where id = $1', [c.familia_id]);
    const envio = await enviarAFamilia(env, db, f, `⚠️ Hola, ${primerNombre(f.tutor)}. No pudimos validar su comprobante: *${motivo}*.\nPor favor envíelo de nuevo o comuníquese con la secretaría.`, 'Comprobante rechazado');
    return json({ envio });
  }

  // ---- Inscripciones y datos de familias ----
  if (p === '/inscripciones' && m === 'POST') {
    try { return json(await inscribir(env, db, body, user.nombre, base)); } catch (x) { return err(x.message); }
  }
  if ((r = p.match(/^\/familias\/([\w-]+)$/)) && m === 'POST') {
    try { return json(await editarFamilia(db, r[1], body)); } catch (x) { return err(x.message); }
  }
  if ((r = p.match(/^\/estudiantes\/([\w-]+)$/)) && m === 'POST') {
    try { return json(await editarEstudiante(db, r[1], body)); } catch (x) { return err(x.message); }
  }

  // ---- Becas, retiros y cierre del año ----
  if ((r = p.match(/^\/estudiantes\/([\w-]+)\/beca$/)) && m === 'POST') {
    try { return json(await fijarBeca(db, r[1], body)); } catch (x) { return err(x.message); }
  }
  if ((r = p.match(/^\/estudiantes\/([\w-]+)\/retirar$/)) && m === 'POST') {
    try { return json(await retirar(db, r[1], body)); } catch (x) { return err(x.message); }
  }
  if ((r = p.match(/^\/estudiantes\/([\w-]+)\/reactivar$/)) && m === 'POST') {
    try { return json(await reactivar(db, r[1])); } catch (x) { return err(x.message); }
  }
  if (p === '/ano/cierre' && m === 'GET') return json({ ...(await resumenCierre(db)), historial: await historialAnos(db) });
  if (p === '/ano/cerrar' && m === 'POST') {
    if (user.rol !== 'director') return err('Solo la dirección puede cerrar el año escolar', 403);
    try { return json(await cerrarAno(db, body, user.nombre)); } catch (x) { return err(x.message); }
  }

  // ---- Facturación ----
  if (p === '/facturas' && m === 'GET') {
    const rows = await db.q('select * from facturas order by fecha desc limit 1000');
    return json({ facturas: rows.map(facturaJSON), conceptos: await conceptos(db), metodos: METODOS, base });
  }
  if (p === '/facturas' && m === 'POST') {
    try {
      const fac = await crearFactura(db, { ...body, usuario: user.nombre });
      let envio = null;
      if (body.enviar && fac.familia_id) {
        const f = await db.one('select * from familias where id = $1', [fac.familia_id]);
        envio = await enviarAFamilia(env, db, f, textoFactura(fac, base), 'Factura ' + fac.id);
      }
      return json({ factura: facturaJSON(fac), url: urlFactura(base, fac.token), texto: textoFactura(fac, base), envio });
    } catch (x) { return err(x.message); }
  }
  if ((r = p.match(/^\/facturas\/(FAC-\d+)\/enviar$/)) && m === 'POST') {
    const fac = await db.one('select * from facturas where id = $1', [r[1]]);
    if (!fac || !fac.familia_id) return err('Esta factura no está ligada a una familia con WhatsApp');
    if (fac.estado === 'anulada') return err('La factura está anulada');
    const f = await db.one('select * from familias where id = $1', [fac.familia_id]);
    return json({ envio: await enviarAFamilia(env, db, f, textoFactura(fac, base), 'Factura ' + fac.id) });
  }
  if ((r = p.match(/^\/facturas\/(FAC-\d+)\/cobrar$/)) && m === 'POST') {
    try {
      const fac = await cobrarFactura(db, r[1], body.metodo, body.ref);
      let envio = null;
      if (body.enviar && fac.familia_id) {
        const f = await db.one('select * from familias where id = $1', [fac.familia_id]);
        envio = await enviarAFamilia(env, db, f, textoFactura(fac, base), 'Factura ' + fac.id);
      }
      return json({ factura: facturaJSON(fac), envio });
    } catch (x) { return err(x.message); }
  }
  if ((r = p.match(/^\/facturas\/(FAC-\d+)\/anular$/)) && m === 'POST') {
    if (user.rol !== 'director') return err('Solo la dirección puede anular facturas', 403);
    try { return json({ factura: facturaJSON(await anularFactura(db, r[1], body.motivo, user.nombre)) }); }
    catch (x) { return err(x.message); }
  }
  if (p === '/facturas/conceptos' && m === 'POST') {
    if (!Array.isArray(body.conceptos)) return err('Lista inválida');
    const lista = body.conceptos.map((c) => ({ n: String(c.n || '').trim().slice(0, 80), p: Math.max(0, Math.round(Number(c.p) || 0)) })).filter((c) => c.n).slice(0, 40);
    await guardarConfig(db, 'conceptos', lista);
    return json({ conceptos: lista });
  }

  // ---- Solicitudes ----
  if ((r = p.match(/^\/ausencias\/([\w-]+)\/visto$/)) && m === 'POST') {
    await db.q('update ausencias set visto = true where id = $1', [r[1]]);
    return json({ ok: true });
  }
  if ((r = p.match(/^\/citas\/([\w-]+)\/confirmar$/)) && m === 'POST') {
    const c = await db.one("update citas set estado = 'ok' where id = $1 returning *", [r[1]]);
    if (!c) return err('Cita no encontrada', 404);
    const f = await db.one('select * from familias where id = $1', [c.familia_id]);
    const envio = await enviarAFamilia(env, db, f, `✅ Su cita con *${c.con}* quedó confirmada para el *${c.dia}* a las *${c.hora}*. ¡Le esperamos!`, 'Cita confirmada');
    return json({ envio });
  }
  if ((r = p.match(/^\/humano\/([\w-]+)\/ok$/)) && m === 'POST') {
    const h = await db.one('update humano set ok = true where id = $1 returning tel', [r[1]]);
    if (h) await db.q("update wa_sesiones set paso = 'menu' where tel = $1 and paso = 'humano'", [h.tel]);
    return json({ ok: true });
  }
  if ((r = p.match(/^\/interesados\/([\w-]+)$/)) && m === 'POST') {
    await db.q('update interesados set estado = $2 where id = $1', [r[1], String(body.estado || 'Nuevo')]);
    return json({ ok: true });
  }

  // ---- Configuración de módulos ----
  if (p === '/config' && m === 'POST') {
    for (const k of ['rules', 'modRec', 'modCirc', 'modoDemo']) if (k in body) {
      if (k === 'modoDemo' && user.rol !== 'director') return err('Solo la dirección puede cambiar esto', 403);
      await guardarConfig(db, k, body[k]);
    }
    return json({ ok: true });
  }

  // ---- Recordatorios ----
  if (p === '/recordatorios/cola' && m === 'GET') {
    const q = await colaRecordatorios(db);
    return json(q.map((x) => ({ fam: x.f.id, tipo: x.tipo })));
  }
  if (p === '/recordatorios/enviar' && m === 'POST') {
    if (body.fam) {
      const q = (await colaRecordatorios(db)).filter((x) => x.f.id === body.fam);
      if (!q.length) return err('No hay recordatorio pendiente para esta familia');
      const { textoRecordatorio } = await import('./avisos.js');
      const x = q[0];
      return json(await enviarAFamilia(env, db, x.f, textoRecordatorio(x.f, x.s, x.tipo), x.tipo === 'mora' ? 'Recordatorio de mora' : 'Aviso previo', { rec: true }));
    }
    return json(await enviarRecordatorios(env, db));
  }

  // ---- Circulares ----
  if (p === '/circulares' && m === 'POST') {
    const cfg = await leerConfig(db);
    if (!cfg.modCirc) return err('El módulo de circulares está desactivado');
    const tit = String(body.tit || '').trim().slice(0, 120), msg = String(body.msg || '').trim().slice(0, 1500);
    const dest = Array.isArray(body.dest) && body.dest.length ? body.dest : ['Todo'];
    if (!tit || !msg) return err('Falta el título o el mensaje');
    const todos = dest.includes('Todo');
    const fams = await db.q(
      `select distinct f.* from familias f join estudiantes e on e.familia_id = f.id and e.estado = 'activo'
       where $1 or e.nivel = any($2::text[]) or e.grado = any($2::text[]) order by f.id`, [todos, dest]);
    const prog = !!body.prog;
    const id = await nuevoId(db, 'K');
    await db.q('insert into circulares(id, tit, msg, dest, n, costo, fecha, prog) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, tit, msg, todos ? 'Todo el colegio' : dest.join(', '), fams.length, fams.length * COLEGIO.costoUtil, new Date(Date.now() + (prog ? 864e5 : 0)).toISOString(), prog]);
    const res = { n: fams.length, enviados: 0, simulados: 0, fallidos: 0 };
    if (!prog) for (const f of fams) {
      const x = await enviarAFamilia(env, db, f, `📢 *${tit}*\n\nEstimada familia:\n${msg}\n\n_${COLEGIO.nombre} · Responda MENÚ para más opciones_`, 'Circular: ' + tit);
      if (x.estado === 'Simulado') res.simulados++; else if (x.estado === 'Falló') res.fallidos++; else res.enviados++;
    }
    return json(res);
  }

  // ---- Conversaciones de WhatsApp ----
  if (p === '/chats' && m === 'GET') {
    const rows = await db.q(`
      select distinct on (m.tel) m.tel, m.texto, m.dir, m.fecha, f.id as fam, f.tutor,
        (select max(fecha) from mensajes x where x.tel = m.tel and x.dir = 'in') as ult_in,
        (select nombre from interesados i where i.tel = m.tel order by fecha desc limit 1) as interesado
      from mensajes m left join familias f on f.tel_wa = m.tel
      order by m.tel, m.fecha desc`);
    const hum = new Set((await db.q('select tel from humano where not ok')).map((x) => x.tel));
    return json(rows.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map((c) => ({
      tel: c.tel, telBonito: telBonito(c.tel), nombre: c.tutor || c.interesado || telBonito(c.tel), fam: c.fam, texto: c.texto, dir: c.dir,
      fecha: iso(c.fecha), abierta: !!c.ult_in && Date.now() - new Date(c.ult_in).getTime() < VENTANA, cierra: c.ult_in ? iso(new Date(c.ult_in).getTime() + VENTANA) : null, humano: hum.has(c.tel),
    })));
  }
  if ((r = p.match(/^\/chats\/(\d+)$/)) && m === 'GET') {
    const msgs = await db.q('select dir, tipo, texto, estado, fecha from mensajes where tel = $1 order by fecha desc limit 150', [r[1]]);
    return json(msgs.reverse().map((x) => ({ ...x, fecha: iso(x.fecha) })));
  }
  if ((r = p.match(/^\/chats\/(\d+)$/)) && m === 'POST') {
    const texto = String(body.texto || '').trim().slice(0, 4000);
    if (!texto) return err('Escribe un mensaje');
    if (!(await ventanaAbierta(db, r[1]))) return err('La ventana de 24 horas está cerrada: solo se puede escribir con una plantilla aprobada por Meta.');
    await db.q("insert into wa_sesiones(tel, paso, ctx, actualizado) values($1, 'humano', '{}', now()) on conflict (tel) do update set paso = 'humano', actualizado = now()", [r[1]]);
    return json(await enviar(env, db, r[1], `👩‍💼 ${user.nombre}:\n${texto}`));
  }

  // ---- Demo ----
  if (p === '/demo/vincular' && m === 'POST') {
    const tel = telWA(body.tel);
    if (tel.length !== 11) return err('Escribe un número dominicano de 10 dígitos');
    const f = await db.one('select * from familias where id = $1', [body.fam]);
    if (!f) return err('Familia no encontrada', 404);
    await db.q("update familias set tel_wa = 'x' || id, real = false where tel_wa = $1 and id <> $2", [tel, f.id]);
    await db.q('update familias set tel = $2, tel_wa = $3, real = true where id = $1', [f.id, telBonito(tel), tel]);
    await db.q('delete from wa_sesiones where tel = $1', [tel]);
    return json({ ok: true });
  }
  if (p === '/demo/reiniciar' && m === 'POST') {
    if (user.rol !== 'director') return err('Solo la dirección puede reiniciar los datos', 403);
    return json(await sembrar(db, hoyRD()));
  }

  return err('No encontrado', 404);
}
