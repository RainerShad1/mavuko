// Servidor del colegio (Cloudflare Worker):
//   /            página web pública (archivos de public/)
//   /panel/      panel administrativo
//   /api/*       API del panel (requiere sesión)
//   /webhook     mensajes de WhatsApp (Meta)
//   cron diario  recordatorios de pago automáticos
import { crearDB } from './db.js';
import { login, logout, usuarioActual, cookieSesion } from './auth.js';
import { api } from './api.js';
import { procesarMensaje } from './bot.js';
import { firmaValida } from './wa.js';
import { enviarRecordatorios } from './avisos.js';
import { leerConfig } from './db.js';

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });

async function webhook(req, env, ctx, db) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    // Verificación que hace Meta al configurar el webhook
    if (url.searchParams.get('hub.mode') === 'subscribe' && env.WA_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN) {
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    }
    return new Response('Prohibido', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const cuerpo = await req.text();
  if (!(await firmaValida(env, cuerpo, req.headers.get('x-hub-signature-256')))) return new Response('Firma inválida', { status: 401 });
  let data;
  try { data = JSON.parse(cuerpo); } catch { return new Response('JSON inválido', { status: 400 }); }
  // Responder rápido a Meta y procesar en segundo plano
  ctx.waitUntil(manejarEventos(env, db, data).catch((e) => console.error('webhook', e)));
  return new Response('ok');
}

export async function manejarEventos(env, db, data) {
  for (const entry of data.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (env.WA_PHONE_ID && v.metadata?.phone_number_id && v.metadata.phone_number_id !== env.WA_PHONE_ID) continue;
      const perfiles = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        const ya = await db.one('select 1 as x from mensajes where wamid = $1', [m.id]); // Meta puede reenviar el mismo evento
        if (ya) continue;
        await procesarMensaje(env, db, m, perfiles[m.from]);
      }
      for (const s of v.statuses || []) {
        const est = { sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'Falló' }[s.status];
        if (!est) continue;
        await db.q('update mensajes set estado = $2 where wamid = $1', [s.id, est]);
        await db.q("update enviados set estado = $2 where wamid = $1 and estado <> 'Leído'", [s.id, est]);
      }
    }
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/webhook') return webhook(req, env, ctx, crearDB(env));
    if (p.startsWith('/api/')) {
      const db = crearDB(env);
      try {
        if (p === '/api/login' && req.method === 'POST') {
          const b = await req.json().catch(() => ({}));
          const r = await login(db, b.usuario, b.clave);
          if (!r) return json({ error: 'Usuario o contraseña incorrectos' }, 401);
          return json({ ok: true, usuario: r.usuario }, 200, { 'Set-Cookie': cookieSesion(r.token, url.protocol === 'https:') });
        }
        if (p === '/api/logout' && req.method === 'POST') {
          await logout(db, req);
          return json({ ok: true }, 200, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
        }
        const user = await usuarioActual(db, req);
        if (!user) return json({ error: 'Inicia sesión' }, 401);
        if (req.method === 'POST' && req.headers.get('x-panel') !== '1') return json({ error: 'Solicitud no permitida' }, 403);
        return await api(req, env, db, user, ctx);
      } catch (e) {
        console.error(e);
        return json({ error: 'Error del servidor: ' + e.message }, 500);
      }
    }
    if (p === '/panel') return Response.redirect(url.origin + '/panel/', 301);
    return env.ASSETS.fetch(req);
  },

  // Todos los días a las 8:00 a. m. (hora de RD) revisa si toca enviar recordatorios
  async scheduled(event, env, ctx) {
    const db = crearDB(env);
    ctx.waitUntil((async () => {
      const cfg = await leerConfig(db);
      if (!cfg.modRec) return;
      const r = await enviarRecordatorios(env, db, { auto: true });
      console.log('recordatorios', JSON.stringify(r));
    })());
  },
};
