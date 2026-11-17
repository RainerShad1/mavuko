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
  llamadas.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
  if (String(url).endsWith('/MEDIA1')) return new Response(JSON.stringify({ url: 'https://lookaside.test/m', mime_type: 'image/jpeg' }));
  if (String(url).startsWith('https://lookaside')) return new Response(new Uint8Array([255, 216, 255, 0, 1, 2]));
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
const reset = await call('/api/demo/reiniciar', 'POST', {}, cookie);
check(reset.status === 200, 'reiniciar');
const tipos = llamadas.filter((l) => l.body?.type).map((l) => l.body.type + (l.body.interactive ? ':' + l.body.interactive.type : ''));
console.log('llamadas a Meta:', [...new Set(tipos)].join(', '), '· total', llamadas.length);
const REALES = new Set([TEL, N2, '18496538063', '18097527776', '18098422800']);
check(llamadas.every((l) => !l.body?.to || REALES.has(l.body.to)), 'solo se escribe a números reales');
console.log(`\n${ok} pruebas bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
