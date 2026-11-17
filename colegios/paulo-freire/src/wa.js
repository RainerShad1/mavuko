// Cliente de la API de WhatsApp (Cloud API de Meta).
// Si WA_TOKEN no está configurado, los envíos se registran como "Simulado".
import { telWA } from './db.js';

const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v23.0'}`;
const corta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export const VENTANA = 24 * 3600e3;

async function llamar(env, payload) {
  const r = await fetch(`${graph(env)}/${env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j?.error?.message || `WhatsApp respondió ${r.status}`);
    e.code = j?.error?.code;
    throw e;
  }
  return j?.messages?.[0]?.id || null;
}

// opciones: [[id, título, descripción?], ...]
export function armarMensaje(tel, texto, opciones, boton = 'Ver opciones') {
  const to = telWA(tel);
  if (!opciones || !opciones.length) return { to, type: 'text', text: { body: corta(texto, 4096), preview_url: true } };
  if (opciones.length <= 3) {
    return {
      to, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: corta(texto, 1024) },
        action: { buttons: opciones.map(([id, t]) => ({ type: 'reply', reply: { id, title: corta(t, 20) } })) },
      },
    };
  }
  return {
    to, type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: corta(texto, 1024) },
      action: {
        button: corta(boton, 20),
        sections: [{ title: 'Opciones', rows: opciones.slice(0, 10).map(([id, t, d]) => ({ id, title: corta(t, 24), ...(d ? { description: corta(d, 72) } : {}) })) }],
      },
    },
  };
}

export async function registrarMensaje(db, tel, dir, tipo, texto, wamid = null, estado = null) {
  await db.q('insert into mensajes(tel, dir, tipo, texto, wamid, estado) values($1,$2,$3,$4,$5,$6)', [telWA(tel), dir, tipo, texto, wamid, estado]);
}

// Envía (o simula) un mensaje y lo registra en el historial
export async function enviar(env, db, tel, texto, opciones, boton) {
  const msg = armarMensaje(tel, texto, opciones, boton);
  const resumen = texto + (opciones && opciones.length ? '\n' + opciones.map(([, t]) => `[${t}]`).join(' ') : '');
  if (!env.WA_TOKEN || !env.WA_PHONE_ID) {
    await registrarMensaje(db, tel, 'out', 'text', resumen, null, 'Simulado');
    return { wamid: null, simulado: true };
  }
  try {
    const wamid = await llamar(env, msg);
    await registrarMensaje(db, tel, 'out', msg.type, resumen, wamid, 'Enviado');
    return { wamid };
  } catch (e) {
    await registrarMensaje(db, tel, 'out', msg.type, resumen, null, 'Falló: ' + e.message);
    return { error: e.message };
  }
}

// Plantilla aprobada (para escribir fuera de la ventana de 24 h)
export async function enviarPlantilla(env, db, tel, nombre, idioma, params, resumen) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID) {
    await registrarMensaje(db, tel, 'out', 'template', resumen, null, 'Simulado');
    return { simulado: true };
  }
  try {
    const wamid = await llamar(env, {
      to: telWA(tel), type: 'template',
      template: { name: nombre, language: { code: idioma }, components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t).replace(/\s*\n+\s*/g, ' · ') })) }] },
    });
    await registrarMensaje(db, tel, 'out', 'template', resumen, wamid, 'Enviado');
    return { wamid };
  } catch (e) {
    await registrarMensaje(db, tel, 'out', 'template', resumen, null, 'Falló: ' + e.message);
    return { error: e.message };
  }
}

export async function ultimaEntrada(db, tel) {
  const r = await db.one("select max(fecha) as f from mensajes where tel = $1 and dir = 'in'", [telWA(tel)]);
  return r && r.f ? new Date(r.f) : null;
}

export async function ventanaAbierta(db, tel) {
  const f = await ultimaEntrada(db, tel);
  return !!f && Date.now() - f.getTime() < VENTANA;
}

// Descarga la foto/documento que mandó el padre
export async function descargarMedia(env, mediaId) {
  if (!env.WA_TOKEN) return null;
  const h = { Authorization: `Bearer ${env.WA_TOKEN}` };
  const meta = await (await fetch(`${graph(env)}/${mediaId}`, { headers: h })).json();
  if (!meta.url) return null;
  const r = await fetch(meta.url, { headers: h });
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > 6e6) return null;
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mime: meta.mime_type || 'image/jpeg', b64: btoa(s) };
}

export async function marcarLeido(env, wamid) {
  if (!env.WA_TOKEN || !wamid) return;
  try { await llamar(env, { status: 'read', message_id: wamid }); } catch { /* sin importancia */ }
}

// Verifica la firma X-Hub-Signature-256 que pone Meta en cada webhook
export async function firmaValida(env, cuerpo, firma) {
  if (!env.WA_APP_SECRET) return true; // sin secreto configurado no se puede verificar
  if (!firma || !firma.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(cuerpo));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const esperado = firma.slice(7);
  if (hex.length !== esperado.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ esperado.charCodeAt(i);
  return r === 0;
}
