// Prueba de punta a punta con una base de datos Postgres en memoria (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import worker, { manejarEventos } from '../src/index.js';
import { sembrar } from '../src/seed.js';
import { hashClave } from '../src/auth.js';

const pg = new PGlite();
await pg.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const db = { q: async (t, p = []) => (await pg.query(t, p)).rows, one: async (t, p) => (await pg.query(t, p ?? [])).rows[0] || null };
const env = { __db: db, ASSETS: { fetch: () => new Response('asset') }, WA_VERIFY_TOKEN: 'v', WA_TOKEN: 't', WA_PHONE_ID: 'p' };
// Simula la API de Meta
const llamadas = [];
globalThis.fetch = async (url, init = {}) => {
  llamadas.push({ url: String(url), body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body ? Object.fromEntries(init.body) : null });
  if (String(url).endsWith('/MEDIA1')) return new Response(JSON.stringify({ url: 'https://lookaside.test/m', mime_type: 'image/jpeg' }));
  if (String(url).startsWith('https://lookaside')) return new Response(new Uint8Array([255, 216, 255, 0, 1, 2]));
  const u = String(url);
  if (u.includes('/PAGINA/photos')) return new Response(JSON.stringify({ id: 'foto' + llamadas.length, post_id: 'PAGINA_post' + llamadas.length }));
  if (u.includes('/PAGINA/feed')) return new Response(JSON.stringify({ id: 'PAGINA_feed' + llamadas.length }));
  if (u.includes('/IGUSER/media_publish')) return new Response(JSON.stringify({ id: 'igmedia1' }));
  if (u.includes('/IGUSER/media')) return new Response(JSON.stringify({ id: 'cont' + llamadas.length }));
  if (u.includes('fields=status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
  if (u.includes('fields=permalink')) return new Response(JSON.stringify({ permalink: 'https://instagram.com/p/abc' }));
  return new Response(JSON.stringify({ messages: [{ id: 'wamid.out' + llamadas.length }] }));
};
const ctx = { waitUntil: (p) => p };
let ok = 0, mal = 0;
const check = (c, msg) => { if (c) ok++; else { mal++; console.log('❌', msg); } };

console.log('semilla', await sembrar(db));
await db.q("insert into usuarios(usuario,nombre,rol,hash,sal) values('director','Director','director',$1,'s1')", [await hashClave('clave123', 's1')]);

const call = async (path, method = 'GET', body, cookie) => {
  const r = await worker.fetch(new Request('https://x.test' + path, { method, headers: { 'content-type': 'application/json', 'x-panel': '1', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  return { status: r.status, headers: r.headers, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};
check((await call('/api/state')).status === 401, 'sin sesión debe dar 401');
check((await call('/api/login', 'POST', { usuario: 'director', clave: 'mala' })).status === 401, 'clave mala');
const lg = await call('/api/login', 'POST', { usuario: 'Director', clave: 'clave123' });
check(lg.status === 200, 'login');
const cookie = lg.headers.get('set-cookie').split(';')[0];
let st = (await call('/api/state', 'GET', null, cookie)).data;
check(st.fams.length === 33 && st.stus.length > 30, 'estado familias');
check(st.fams.filter((f) => f.real).map((f) => f.tutor).join() === 'Karolin,Fátima,Damián Morales', 'contactos de prueba reales');
console.log('hoy', st.meta.hoy, 'cur', st.meta.cur, 'pagos', st.pays.length, 'comps', st.comps.length);

// Pago desde el panel
const e = st.stus[0];
const pg1 = await call('/api/pagos', 'POST', { est: e.id, meses: [st.meta.meses[9].k], met: 'Efectivo' }, cookie);
check(pg1.status === 200 && pg1.data.id.startsWith('R-'), 'registrar pago ' + JSON.stringify(pg1.data));

// Vincular un número real a la familia F4 (en mora) y simular WhatsApp
const TEL = '18295550199';
check((await call('/api/demo/vincular', 'POST', { fam: 'F4', tel: '829-555-0199' }, cookie)).status === 200, 'vincular');
let n = 0;
const wa = async (m) => {
  await manejarEventos(env, db, { entry: [{ changes: [{ value: { contacts: [{ wa_id: m.from || TEL, profile: { name: 'Prueba' } }], messages: [{ from: TEL, id: 'wamid.' + (++n), timestamp: '1', ...m }] } }] }] });
  const r = await db.q("select texto from mensajes where dir='out' order by id desc limit 1");
  return r[0]?.texto || '';
};
let t = await wa({ type: 'text', text: { body: 'Hola' } });
check(t.includes('asistente virtual') && t.includes('[💳 Estado de cuenta]'), 'menú: ' + t.slice(0, 80));
t = await wa({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'estado', title: 'Estado' } } });
check(t.includes('Estado de cuenta'), 'estado de cuenta');
console.log('---\n' + t + '\n---');
t = await wa({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'comp', title: 'comp' } } });
console.log(t.slice(0, 120));
t = await wa({ type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg' } });
check(t.includes('Recibimos su comprobante') || t.includes('De cuál estudiante'), 'comprobante: ' + t.slice(0, 100));
if (t.includes('De cuál')) { const id = (await db.one("select ctx from wa_sesiones where tel=$1", [TEL])); const est = (await db.one("select id from estudiantes where familia_id='F4'")).id; t = await wa({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'hijo:compfoto:' + est, title: 'x' } } }); }
check((await db.q("select * from comprobantes where familia_id='F4' and imagen is not null")).length === 1, 'comprobante guardado con foto');
t = await wa({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'aus', title: 'aus' } } });
const est4 = (await db.one("select id from estudiantes where familia_id='F4' order by id")).id;
t = await wa({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: `mot:${est4}:Enfermedad`, title: 'Enfermedad' } } });
check(t.includes('Registramos la ausencia'), 'ausencia: ' + t.slice(0, 60));
await wa({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'cita', title: 'cita' } } });
t = await wa({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'con:Dirección', title: 'Dirección' } } });
const dia = t.match(/\[([^\]]+)\]/)[1];
await wa({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'dia:' + dia, title: dia } } });
t = await wa({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'hora:10:00 a. m.', title: '10:00 a. m.' } } });
check(t.includes('Solicitud enviada') && t.includes('10:00 a. m.'), 'cita: ' + t);
t = await wa({ type: 'text', text: { body: 'Necesito un comprobante fiscal' } });
check(t.includes('comprobante fiscal') && t.includes('[👩‍💼 Secretaría]') && !t.includes('foto'), 'pedido fiscal no se confunde con comprobante de pago: ' + t.slice(0, 60));
t = await wa({ type: 'text', text: { body: 'factura con credito fiscal y mi RNC' } });
check(t.includes('comprobante fiscal'), 'crédito fiscal / RNC');
t = await wa({ type: 'text', text: { body: 'a que hora salen?' } });
check(t.includes('Horario'), 'faq horario');
t = await wa({ type: 'text', text: { body: 'quiero hablar de algo raro' } });
check(t.includes('secretaría'), 'pasa a humano');
t = await wa({ type: 'text', text: { body: 'hola?' } });
check(t.includes('asistente virtual'), 'saludo reactiva menú');

// Número desconocido
const N2 = '18495550111';
const wa2 = async (m) => { await manejarEventos(env, db, { entry: [{ changes: [{ value: { messages: [{ from: N2, id: 'wamid.n' + (++n), ...m }] } }] }] }); return (await db.q("select texto from mensajes where dir='out' and tel=$1 order by id desc limit 1", [N2]))[0]?.texto || ''; };
t = await wa2({ type: 'text', text: { body: 'Buenas' } });
check(t.includes('Gracias por escribir'), 'nuevo bienvenida');
await wa2({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'ins', title: 'ins' } } });
t = await wa2({ type: 'text', text: { body: 'Me llamo Laura Gómez' } });
check(t.includes('Laura'), 'nombre interesado');
t = await wa2({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'niv:Primaria', title: 'Primaria' } } });
check((await db.q("select * from interesados where nombre='Laura Gómez'")).length === 1, 'interesado guardado');
t = await wa2({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'estado', title: 'x' } } });
check(t.includes('Gracias por escribir'), 'desconocido no ve estado de cuenta');
// mensaje repetido no se procesa dos veces
const antes = (await db.q('select count(*)::int as c from mensajes'))[0].c;
await manejarEventos(env, db, { entry: [{ changes: [{ value: { messages: [{ from: N2, id: 'wamid.n' + n, type: 'text', text: { body: 'Buenas' } }] } }] }] });
check((await db.q('select count(*)::int as c from mensajes'))[0].c === antes, 'deduplicación');

// Panel: aprobar comprobante, rechazar, confirmar cita, chats
st = (await call('/api/state', 'GET', null, cookie)).data;
const c4 = st.comps.find((c) => c.fam === 'F4' && c.img);
const ap = await call(`/api/comprobantes/${c4.id}/aprobar`, 'POST', {}, cookie);
check(ap.status === 200 && ap.data.recibo, 'aprobar ' + JSON.stringify(ap.data));
console.log('envío del recibo:', ap.data.envio);
const otro = st.comps.find((c) => c.fam !== 'F4' && c.estado === 'pend');
check((await call(`/api/comprobantes/${otro.id}/rechazar`, 'POST', { motivo: 'Monto no coincide' }, cookie)).data.envio.estado === 'Simulado', 'rechazar simulado (familia de prueba)');
const cita = st.citas.find((c) => c.fam === 'F4');
check((await call(`/api/citas/${cita.id}/confirmar`, 'POST', {}, cookie)).status === 200, 'confirmar cita');
const chats = (await call('/api/chats', 'GET', null, cookie)).data;
check(chats.length === 2 && chats.some((c) => c.fam === 'F4'), 'chats');
const msgs = (await call('/api/chats/' + TEL, 'GET', null, cookie)).data;
check(msgs.length > 10, 'mensajes del chat');
check((await call('/api/chats/' + TEL, 'POST', { texto: 'Hola, le escribe la secretaría' }, cookie)).status === 200, 'responder chat');
// Módulos
check((await call('/api/circulares', 'POST', { tit: 'x', msg: 'y' }, cookie)).status === 400, 'circular bloqueada');
await call('/api/config', 'POST', { modCirc: true, modRec: true }, cookie);
const cr = await call('/api/circulares', 'POST', { tit: 'Reunión', msg: 'Mañana', dest: ['Primaria'] }, cookie);
check(cr.status === 200 && cr.data.n > 0, 'circular ' + JSON.stringify(cr.data));
const rr = await call('/api/recordatorios/enviar', 'POST', {}, cookie);
check(rr.status === 200 && rr.data.total > 0, 'recordatorios ' + JSON.stringify(rr.data));
st = (await call('/api/state', 'GET', null, cookie)).data;
check(st.sent.some((s) => s.fam === 'F4' && s.est !== 'Simulado'), 'F4 real recibe envíos');
// webhook GET verificación y estados
const v = await worker.fetch(new Request('https://x.test/webhook?hub.mode=subscribe&hub.verify_token=v&hub.challenge=123'), env, ctx);
check((await v.text()) === '123', 'verificación webhook');
// ---- Página web y redes ----
let pub = (await call('/api/publico/contenido')).data;
check(pub.publicaciones.length === 2 && pub.galeria.length === 2 && pub.portada.banner, 'contenido público inicial');
const md = await call('/api/medios', 'POST', { datos: btoa('jpegfalso'), ancho: 10, alto: 10 }, cookie);
check(md.status === 200 && md.data.url.startsWith('/media/'), 'subir foto');
const img = await worker.fetch(new Request('https://x.test' + md.data.url), env, ctx);
check(img.status === 200 && (await img.text()) === 'jpegfalso', 'servir foto pública');
let np = await call('/api/publicaciones', 'POST', { titulo: 'Feria científica', texto: 'Proyectos', fotos: [md.data.url, '/assets/fotos/admisiones.jpg'], fotosIg: [md.data.ig, '/assets/fotos/admisiones.jpg'], fb: true, ig: true }, cookie);
check(np.status === 200 && np.data.redes.fb.estado === 'simulado' && np.data.redes.ig.estado === 'simulado', 'publicar sin redes conectadas = simulado ' + JSON.stringify(np.data));
env.FB_PAGE_ID = 'PAGINA'; env.FB_PAGE_TOKEN = 'tok'; env.IG_USER_ID = 'IGUSER';
np = await call('/api/publicaciones', 'POST', { titulo: 'Acto cívico', texto: 'Izamos la bandera', fotos: [md.data.url], fotosIg: [md.data.ig], fb: true, ig: true }, cookie);
check(np.data.redes.fb.estado === 'publicado' && np.data.redes.fb.link.includes('facebook.com') && np.data.redes.ig.link === 'https://instagram.com/p/abc', 'publicar en FB e IG ' + JSON.stringify(np.data));
const fbCall = llamadas.find((l) => l.url.includes('/PAGINA/photos'));
check(fbCall && fbCall.body.url === 'https://x.test' + md.data.url && fbCall.body.caption.includes('Acto cívico'), 'Facebook recibe la URL pública de la foto');
check(llamadas.some((l) => l.url.includes('/IGUSER/media') && l.body?.image_url === 'https://x.test' + md.data.ig), 'Instagram recibe la versión ajustada');
np = await call('/api/publicaciones', 'POST', { titulo: 'Varias fotos', fotos: [md.data.url, md.data.url], fb: true }, cookie);
check(np.data.redes.fb.estado === 'publicado', 'facebook con varias fotos');
check((await call('/api/publicaciones', 'POST', { titulo: 'Sin foto', ig: true }, cookie)).status === 400, 'instagram exige foto');
const ct = (await call('/api/contenido', 'GET', null, cookie)).data;
check(ct.publicaciones.length === 5 && ct.redes.fb && ct.redes.ig, 'contenido del panel');
check((await call('/api/publicaciones/' + ct.publicaciones[0].id, 'POST', { web: false }, cookie)).status === 200, 'ocultar de la web');
check((await call('/api/galeria', 'POST', { foto: md.data.url, texto: 'Recreo' }, cookie)).status === 200, 'agregar a galería');
check((await call('/api/galeria', 'POST', { foto: 'https://malicioso.com/x.jpg' }, cookie)).status === 400, 'rechaza fotos externas');
check((await call('/api/portada', 'POST', { banner: md.data.url }, cookie)).status === 200, 'cambiar portada');
pub = (await call('/api/publico/contenido')).data;
check(pub.portada.banner === md.data.url && pub.galeria.length === 3, 'web refleja cambios');

// ---- Facturación ----
let fx = (await call('/api/facturas', 'GET', null, cookie)).data;
check(fx.facturas.length > 100 && fx.conceptos.length > 3, 'facturas sembradas ' + fx.facturas.length);
check(fx.facturas.some((f) => f.estado === 'pendiente'), 'hay facturas pendientes de ejemplo');
const pagoFac = fx.facturas.find((f) => f.recibo === pg1.data.id);
check(pagoFac && pg1.data.factura === pagoFac.id && pg1.data.texto.includes('/f/' + pagoFac.token), 'el pago genera factura con enlace');
const pag = await worker.fetch(new Request('https://x.test/f/' + pagoFac.token), env, ctx);
const html = await pag.text();
check(pag.status === 200 && html.includes(pagoFac.id) && html.includes('PAGADA') && html.includes('No es un comprobante fiscal'), 'página pública de la factura');
check((await worker.fetch(new Request('https://x.test/f/noexisteestetokenxx'), env, ctx)).status === 404, 'token inválido = 404');
// Factura con mensualidad + conceptos + descuento, guardando cédula
st = (await call('/api/state', 'GET', null, cookie)).data;
const pagadosSt = new Set(st.pays.map((p) => p.est + '|' + p.mes));
const e5 = st.stus.find((s) => s.fam === 'F4');
const libre = st.meta.meses.map((m) => m.k).find((k) => !pagadosSt.has(e5.id + '|' + k));
let nf = await call('/api/facturas', 'POST', { fam: 'F4', doc: '001-1234567-8', lineas: [{ est: e5.id, mes: libre }, { d: 'Uniforme (polo)', cant: 2, precio: 850 }], descuento: 200, metodo: 'Tarjeta', enviar: true }, cookie);
check(nf.status === 200 && nf.data.factura.total === st.meta.tarifas[e5.nivel] + 1700 - 200 && nf.data.envio, 'factura combinada ' + JSON.stringify(nf.data).slice(0, 200));
check((await db.one("select doc from familias where id='F4'")).doc === '001-1234567-8', 'guarda la cédula en la familia');
check((await db.one('select 1 as x from pagos where estudiante_id=$1 and mes=$2', [e5.id, libre])), 'la mensualidad facturada queda pagada');
check((await call('/api/facturas', 'POST', { fam: 'F4', lineas: [{ est: e5.id, mes: libre }] }, cookie)).status === 400, 'no permite cobrar dos veces el mismo mes');
check((await call('/api/facturas', 'POST', { fam: 'F4', lineas: [{ d: 'X', precio: 100 }], descuento: 500 }, cookie)).status === 400, 'descuento mayor que el total');
// Pendiente → cobrar
const libre2 = st.meta.meses.map((m) => m.k).find((k) => k !== libre && !pagadosSt.has(e5.id + '|' + k));
const pend = await call('/api/facturas', 'POST', { fam: 'F4', pagada: false, lineas: [{ est: e5.id, mes: libre2 }] }, cookie);
check(pend.data.factura.estado === 'pendiente' && !(await db.one('select 1 as x from pagos where estudiante_id=$1 and mes=$2', [e5.id, libre2])), 'factura pendiente no marca el mes');
const cob = await call(`/api/facturas/${pend.data.factura.id}/cobrar`, 'POST', { metodo: 'Efectivo' }, cookie);
check(cob.data.factura.estado === 'pagada' && cob.data.factura.recibo && (await db.one('select 1 as x from pagos where estudiante_id=$1 and mes=$2', [e5.id, libre2])), 'cobrar factura pendiente');
// Anular devuelve el mes a pendiente
const an = await call(`/api/facturas/${nf.data.factura.id}/anular`, 'POST', { motivo: 'Error de digitación' }, cookie);
check(an.data.factura.estado === 'anulada' && !(await db.one('select 1 as x from pagos where estudiante_id=$1 and mes=$2', [e5.id, libre])), 'anular libera la mensualidad');
check((await call(`/api/facturas/${nf.data.factura.id}/anular`, 'POST', { motivo: 'x' }, cookie)).status === 400, 'no se anula dos veces');
check((await call('/api/facturas/conceptos', 'POST', { conceptos: [{ n: 'Inscripción', p: 7000 }] }, cookie)).data.conceptos[0].p === 7000, 'editar conceptos');
// El asistente comparte las facturas
t = await wa({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'fac', title: 'Mis facturas' } } });
check(t.includes('Sus últimas facturas') && t.includes('/f/'), 'bot facturas: ' + t.slice(0, 80));

// ---- Ticket 80 mm ----
const tk = await (await worker.fetch(new Request('https://x.test/f/' + pagoFac.token + '?t=80'), env, ctx)).text();
check(tk.includes('80mm') && tk.includes('RNC 2600334623') && tk.includes(pagoFac.id), 'ticket 80 mm');
check(html.includes('RNC 2600334623'), 'RNC en la factura');
// ---- Inscripciones ----
const int1 = st.ints[0];
let ins = await call('/api/inscripciones', 'POST', { desde: null, familia: { tutor: 'Laura Gómez', parentesco: 'Madre', tel: '809-555-0188', doc: '001-7654321-0' }, estudiantes: [{ nombre: 'Ana Gómez', grado: '3.º Primaria' }, { nombre: 'Leo Gómez', grado: 'Pre-primario' }], interesado: int1.id, cobrar: true, metodo: 'Efectivo', bienvenida: true }, cookie);
check(ins.status === 200 && ins.data.estudiantes.length === 2 && ins.data.factura, 'inscribir familia nueva ' + JSON.stringify(ins.data).slice(0, 150));
st = (await call('/api/state', 'GET', null, cookie)).data;
check(st.stus.filter((x) => x.fam === ins.data.fam).map((x) => x.nivel).join() === 'Primaria,Inicial', 'nivel según el grado');
check(st.stus.filter((x) => x.fam === ins.data.fam).every((x) => x.desde && x.desde >= st.meta.cur), 'inscrito paga desde el primer mes sin vencer');
const { estadoDeFamilia } = await import('../src/avisos.js');
const sIns = await estadoDeFamilia(db, ins.data.fam);
check(sIns.mora === 0, 'inscrito a mitad de año no queda en mora ' + sIns.mora);
check((await call('/api/facturas', 'POST', { fam: ins.data.fam, lineas: [{ est: ins.data.estudiantes[0], mes: st.meta.meses[0].k }] }, cookie)).status === 400, 'no se factura un mes anterior a la inscripción');
check(st.ints.find((i) => i.id === int1.id).estado === 'Inscrito', 'interesado pasa a inscrito');
const facIns = await db.one('select * from facturas where id = $1', [ins.data.factura.id]);
check(facIns.total === 7000 * 2 && facIns.estado === 'pagada', 'factura de inscripción con el precio del catálogo');
check((await call('/api/inscripciones', 'POST', { familia: { tutor: 'Otro', tel: '809-555-0188' }, estudiantes: [{ nombre: 'X Y', grado: '1.º Primaria' }] }, cookie)).status === 400, 'teléfono repetido');
check((await call('/api/inscripciones', 'POST', { fam: ins.data.fam, estudiantes: [{ nombre: 'Mar Gómez', grado: 'Grado raro' }] }, cookie)).status === 400, 'grado inválido');
check((await call('/api/inscripciones', 'POST', { fam: ins.data.fam, estudiantes: [{ nombre: 'Mar Gómez', grado: '1.º Secundaria' }] }, cookie)).status === 200, 'agregar hermano a familia existente');
check((await call('/api/familias/' + ins.data.fam, 'POST', { tutor: 'Laura M. Gómez', tel: '829-555-0188' }, cookie)).status === 200, 'editar familia');
check((await call('/api/estudiantes/' + ins.data.estudiantes[0], 'POST', { grado: '4.º Primaria' }, cookie)).status === 200, 'cambiar de grado');

// ---- Becas y descuentos ----
st = (await call('/api/state', 'GET', null, cookie)).data;
check(st.stus.filter((x) => x.beca_pct || x.beca_monto).length >= 3, 'becas de ejemplo');
const { tarifaEst, ANO } = await import('../src/cobros.js');
const eb = st.stus.find((x) => x.estado === 'activo' && x.nivel === 'Primaria' && !x.beca_pct && !x.beca_monto && !x.desde);
check((await call(`/api/estudiantes/${eb.id}/beca`, 'POST', { pct: 150 }, cookie)).status === 400, 'beca mayor de 100 %');
const bk = await call(`/api/estudiantes/${eb.id}/beca`, 'POST', { pct: 25, monto: 200, motivo: 'Hermanos' }, cookie);
check(bk.data.mensualidad === Math.round(5200 * .75) - 200, 'mensualidad con beca ' + JSON.stringify(bk.data));
st = (await call('/api/state', 'GET', null, cookie)).data;
const pagEb = new Set(st.pays.filter((x) => x.est === eb.id).map((x) => x.mes));
const mesEb = st.meta.meses.map((m) => m.k).find((k) => !pagEb.has(k));
const fb = await call('/api/facturas', 'POST', { fam: eb.fam, lineas: [{ est: eb.id, mes: mesEb }] }, cookie);
check(fb.data.factura.total === 3700 && fb.data.factura.items[0].d.includes('Hermanos'), 'factura con beca ' + fb.data.factura?.total);
// beca completa: no debe nada
await call(`/api/estudiantes/${eb.id}/beca`, 'POST', { pct: 100, motivo: 'Beca académica' }, cookie);
let sb = await estadoDeFamilia(db, eb.fam);
check(![...sb.mesesMora, ...sb.mesesPend].some((z) => z[0].id === eb.id), 'beca completa no genera deuda');
await call(`/api/estudiantes/${eb.id}/beca`, 'POST', { pct: 0, monto: 0 }, cookie);
// ---- Retiro ----
const er = st.stus.find((x) => x.estado === 'activo' && x.id !== eb.id && st.stus.filter((y) => y.fam === x.fam).length === 1 && !x.desde);
const ret = await call(`/api/estudiantes/${er.id}/retirar`, 'POST', { hasta: st.meta.meses[2].k, motivo: 'Mudanza' }, cookie);
check(ret.status === 200, 'retirar ' + JSON.stringify(ret.data));
const sr = await estadoDeFamilia(db, er.fam);
check(![...sr.mesesMora, ...sr.mesesPend].some((z) => z[1] > st.meta.meses[2].k), 'retirado no debe meses después del retiro');
check((await call('/api/facturas', 'POST', { fam: er.fam, lineas: [{ est: er.id, mes: st.meta.meses[5].k }] }, cookie)).status === 400, 'no se factura después del retiro');
// ---- Cierre del año ----
const pre = (await call('/api/ano/cierre', 'GET', null, cookie)).data;
check(pre.ano === '2026–2027' && pre.siguiente.inicio === '2027-08' && pre.totalDeuda > 0, 'resumen de cierre ' + pre.ano + ' ' + pre.totalDeuda);
// las facturas pendientes con mensualidades bloquean el cierre
if (pre.facturasPendientes.length) check((await call('/api/ano/cerrar', 'POST', { confirmar: 'CERRAR', inicio: '2027-08' }, cookie)).status === 400, 'pendientes bloquean el cierre');
for (const f of (await call('/api/ano/cierre', 'GET', null, cookie)).data.facturasPendientes) await call(`/api/facturas/${f.id}/anular`, 'POST', { motivo: 'Cierre de prueba' }, cookie);
check((await call('/api/ano/cerrar', 'POST', { confirmar: 'no', inicio: '2027-08' }, cookie)).status === 400, 'cierre exige confirmación');
const pre2 = (await call('/api/ano/cierre', 'GET', null, cookie)).data;
const egr = pre2.estudiantes.find((x) => x.grado === '6.º Secundaria' && x.estado === 'activo');
const rep = pre2.estudiantes.find((x) => x.grado === '2.º Primaria' && x.estado === 'activo');
const prom = pre2.estudiantes.find((x) => x.grado === 'Pre-primario' && x.estado === 'activo');
const conDeuda = pre2.estudiantes.find((x) => x.debe > 0 && x.estado === 'activo');
const dec = {}; if (rep) dec[rep.id] = 'repite';
const cierre = await call('/api/ano/cerrar', 'POST', { confirmar: 'CERRAR', inicio: '2027-08', tarifas: { Inicial: 4800, Primaria: 5500, Secundaria: 6200 }, decisiones: dec, conservarBecas: true }, cookie);
check(cierre.status === 200 && cierre.data.nuevo === '2027–2028' && cierre.data.saldos > 0, 'cerrar año ' + JSON.stringify(cierre.data));
st = (await call('/api/state', 'GET', null, cookie)).data;
check(st.meta.ano === '2027–2028' && st.meta.meses[0].k === '2027-08' && st.meta.tarifas.Primaria === 5500, 'año nuevo con tarifas nuevas');
if (prom) check(st.stus.find((x) => x.id === prom.id).grado === '1.º Primaria' && st.stus.find((x) => x.id === prom.id).nivel === 'Primaria', 'promovido de grado y nivel');
if (rep) check(st.stus.find((x) => x.id === rep.id).grado === '2.º Primaria', 'repite el grado');
if (egr) check(st.stus.find((x) => x.id === egr.id).estado === 'egresado', 'egresado');
check(st.saldos.some((x) => x.est === conDeuda.id && x.monto === conDeuda.debe), 'deuda pasa a saldo del año anterior');
check(st.stus.filter((x) => x.beca_pct || x.beca_monto).length >= 3, 'se conservan las becas');
const sc = await estadoDeFamilia(db, conDeuda.fam);
check(sc.saldoAnt === st.saldos.filter((x) => x.fam === conDeuda.fam).reduce((a, x) => a + x.monto, 0) && sc.mora >= sc.saldoAnt, 'saldo anterior en el estado de cuenta');
// cobrar el saldo con una factura y anularla
const sal = st.saldos.find((x) => x.est === conDeuda.id);
const fs1 = await call('/api/facturas', 'POST', { fam: conDeuda.fam, lineas: [{ saldo: sal.id }] }, cookie);
check(fs1.status === 200 && fs1.data.factura.total === sal.monto && (await db.one('select pagado from saldos where id = $1', [sal.id])).pagado, 'cobrar saldo anterior');
check((await call('/api/facturas', 'POST', { fam: conDeuda.fam, lineas: [{ saldo: sal.id }] }, cookie)).status === 400, 'saldo no se cobra dos veces');
await call(`/api/facturas/${fs1.data.factura.id}/anular`, 'POST', { motivo: 'prueba' }, cookie);
check(!(await db.one('select pagado from saldos where id = $1', [sal.id])).pagado, 'anular devuelve el saldo');
check((await call('/api/ano/cierre', 'GET', null, cookie)).data.historial.length === 1, 'historial de años');

const reset = await call('/api/demo/reiniciar', 'POST', {}, cookie);
check(reset.status === 200, 'reiniciar');
check((await call('/api/state', 'GET', null, cookie)).data.meta.ano === '2026–2027', 'reiniciar vuelve al año de la demo');
const tipos = llamadas.filter((l) => l.body?.type).map((l) => l.body.type + (l.body.interactive ? ':' + l.body.interactive.type : ''));
console.log('llamadas a Meta:', [...new Set(tipos)].join(', '), '· total', llamadas.length);
const REALES = new Set([TEL, N2, '18496538063', '18097527776', '18098422800']);
check(llamadas.every((l) => !l.body?.to || REALES.has(l.body.to)), 'solo se escribe a números reales');
console.log(`\n${ok} pruebas bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
