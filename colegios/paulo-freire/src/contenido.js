// Contenido editable de la página web: portada, actividades/noticias y galería.
import { leerConfig, guardarConfig, nuevoId } from './db.js';
import { publicarFacebook, publicarInstagram, redesConectadas } from './redes.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const fechaTxt = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export const PORTADA_INICIAL = { banner: '/assets/fotos/admisiones.jpg', alt: 'Estudiantes del Colegio Paulo Freire con uniforme. Admisiones abiertas.' };

// Contenido inicial con las fotos reales que entregó el colegio (solo la primera vez)
async function contenidoInicial(db) {
  const cfg = await leerConfig(db);
  if (cfg.contenidoIniciado) return;
  const hace = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  await db.q(`insert into publicaciones(id, tipo, titulo, texto, fecha, fotos, fotos_ig) values
    ('P1', 'actividad', 'Desfile de moda reciclada', 'Los estudiantes de sexto diseñaron sus trajes con periódicos, bolsas y otros materiales reciclados, y los presentaron en pasarela. Creatividad y cuidado del medio ambiente en una misma actividad.', $1, array['/assets/fotos/desfile-reciclaje.jpg'], array['/assets/fotos/desfile-reciclaje-ig.jpg']),
    ('P2', 'noticia', 'Inscripciones abiertas para Nivel Inicial', 'Matrícula del período escolar 2026-2027 para niños de 2 a 5 años. Aprenden jugando, en un ambiente seguro y cercano. Llámanos al 809-813-1059 o escríbenos por WhatsApp.', $2, array['/assets/fotos/inicial-inscripciones.jpg'], array['/assets/fotos/inicial-inscripciones.jpg'])
    on conflict do nothing`, [hace(4), hace(9)]);
  await db.q(`insert into galeria(id, foto, texto, orden) values
    ('G1', '/assets/fotos/desfile-reciclaje.jpg', 'Desfile de moda reciclada · Sexto', 1),
    ('G2', '/assets/fotos/admisiones.jpg', 'Estudiantes de secundaria', 2)
    on conflict do nothing`);
  await guardarConfig(db, 'contenidoIniciado', true);
}

const pubDe = (p) => ({
  id: p.id, tipo: p.tipo, titulo: p.titulo, texto: p.texto, fecha: fechaTxt(p.fecha), fotos: p.fotos, fotosIg: p.fotos_ig,
  web: p.web, fb: p.fb_estado, fbLink: p.fb_link, ig: p.ig_estado, igLink: p.ig_link, error: p.error, creado: iso(p.creado),
});

// Lo que necesita la página pública
export async function contenidoPublico(db) {
  await contenidoInicial(db);
  const cfg = await leerConfig(db);
  const pubs = await db.q('select * from publicaciones where web order by fecha desc, creado desc limit 12');
  const gal = await db.q('select id, foto, texto from galeria where visible order by orden, creado limit 24');
  return {
    portada: { ...PORTADA_INICIAL, ...(cfg.portada || {}) },
    publicaciones: pubs.map((p) => ({ id: p.id, tipo: p.tipo, titulo: p.titulo, texto: p.texto, fecha: fechaTxt(p.fecha), fotos: p.fotos })),
    galeria: gal,
  };
}

// Lo que necesita el panel
export async function contenidoPanel(env, db) {
  await contenidoInicial(db);
  const cfg = await leerConfig(db);
  const pubs = await db.q('select * from publicaciones order by fecha desc, creado desc');
  const gal = await db.q('select * from galeria order by orden, creado');
  return {
    portada: { ...PORTADA_INICIAL, ...(cfg.portada || {}) },
    publicaciones: pubs.map(pubDe),
    galeria: gal.map((g) => ({ id: g.id, foto: g.foto, texto: g.texto, visible: g.visible })),
    redes: redesConectadas(env),
  };
}

export async function servirMedio(db, id, ig) {
  const m = await db.one('select mime, datos, ig from medios where id = $1', [id]);
  if (!m) return new Response('No encontrado', { status: 404 });
  const b64 = ig && m.ig ? m.ig : m.datos;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': m.mime || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

const limpiaFotos = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && /^\/(media\/[\w-]+(\?ig=1)?|assets\/fotos\/[\w.-]+)$/.test(x)).slice(0, 10) : []);

async function publicarEnRedes(env, db, origen, p, pedir) {
  const abs = (u) => origen + u;
  const res = {};
  const errores = [];
  if (pedir.fb) {
    try { const r = await publicarFacebook(env, p, p.fotos.map(abs), origen); res.fb = r; }
    catch (e) { res.fb = { estado: 'falló' }; errores.push('Facebook: ' + e.message); }
  }
  if (pedir.ig) {
    try { const r = await publicarInstagram(env, p, (p.fotos_ig.length ? p.fotos_ig : p.fotos).map(abs)); res.ig = r; }
    catch (e) { res.ig = { estado: 'falló' }; errores.push('Instagram: ' + e.message); }
  }
  await db.q(
    `update publicaciones set
       fb_estado = coalesce($2, fb_estado), fb_link = coalesce($3, fb_link),
       ig_estado = coalesce($4, ig_estado), ig_link = coalesce($5, ig_link),
       error = $6 where id = $1`,
    [p.id, res.fb?.estado || null, res.fb?.link || null, res.ig?.estado || null, res.ig?.link || null, errores.join(' · ') || null]
  );
  return { ...res, error: errores.join(' · ') || null };
}

// Rutas del panel para la página web. Devuelve null si la ruta no es de este módulo.
export async function apiContenido(req, env, db, p, m, body, json, err) {
  let r;
  const origen = new URL(req.url).origin;
  if (p === '/contenido' && m === 'GET') return json(await contenidoPanel(env, db));

  if (p === '/medios' && m === 'POST') {
    const datos = String(body.datos || '');
    if (!datos || datos.length > 4e6) return err('La foto no es válida o es demasiado grande');
    const id = await nuevoId(db, 'M');
    await db.q('insert into medios(id, mime, ancho, alto, datos, ig) values($1,$2,$3,$4,$5,$6)',
      [id, 'image/jpeg', body.ancho | 0, body.alto | 0, datos, body.ig ? String(body.ig) : null]);
    return json({ url: `/media/${id}`, ig: body.ig ? `/media/${id}?ig=1` : `/media/${id}` });
  }

  if (p === '/portada' && m === 'POST') {
    const [banner] = limpiaFotos([body.banner]);
    if (!banner) return err('Elige una imagen para la portada');
    await guardarConfig(db, 'portada', { banner, alt: String(body.alt || PORTADA_INICIAL.alt).slice(0, 200) });
    return json({ ok: true });
  }

  if (p === '/publicaciones' && m === 'POST') {
    const titulo = String(body.titulo || '').trim().slice(0, 140);
    const texto = String(body.texto || '').trim().slice(0, 2000);
    if (!titulo) return err('Escribe un título');
    const fotos = limpiaFotos(body.fotos), fotosIg = limpiaFotos(body.fotosIg);
    if (body.ig && !fotos.length) return err('Para publicar en Instagram agrega al menos una foto');
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '') ? body.fecha : new Date().toISOString().slice(0, 10);
    const id = await nuevoId(db, 'P');
    const pub = await db.one(
      `insert into publicaciones(id, tipo, titulo, texto, fecha, fotos, fotos_ig, web) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [id, body.tipo === 'noticia' ? 'noticia' : 'actividad', titulo, texto, fecha, fotos, fotosIg.length === fotos.length ? fotosIg : fotos, body.web !== false]
    );
    const redes = (body.fb || body.ig) ? await publicarEnRedes(env, db, origen, pub, { fb: !!body.fb, ig: !!body.ig }) : {};
    return json({ id, redes });
  }
  if ((r = p.match(/^\/publicaciones\/([\w-]+)$/)) && m === 'POST') {
    const campos = [], vals = [r[1]];
    if ('web' in body) { vals.push(!!body.web); campos.push(`web = $${vals.length}`); }
    if ('titulo' in body) { vals.push(String(body.titulo).trim().slice(0, 140)); campos.push(`titulo = $${vals.length}`); }
    if ('texto' in body) { vals.push(String(body.texto).trim().slice(0, 2000)); campos.push(`texto = $${vals.length}`); }
    if (!campos.length) return err('Nada que cambiar');
    await db.q(`update publicaciones set ${campos.join(', ')} where id = $1`, vals);
    return json({ ok: true });
  }
  if ((r = p.match(/^\/publicaciones\/([\w-]+)\/redes$/)) && m === 'POST') {
    const pub = await db.one('select * from publicaciones where id = $1', [r[1]]);
    if (!pub) return err('Publicación no encontrada', 404);
    if (body.ig && !pub.fotos.length) return err('Para publicar en Instagram agrega al menos una foto');
    return json(await publicarEnRedes(env, db, origen, pub, { fb: !!body.fb, ig: !!body.ig }));
  }
  if ((r = p.match(/^\/publicaciones\/([\w-]+)\/borrar$/)) && m === 'POST') {
    await db.q('delete from publicaciones where id = $1', [r[1]]);
    return json({ ok: true });
  }

  if (p === '/galeria' && m === 'POST') {
    const [foto] = limpiaFotos([body.foto]);
    if (!foto) return err('Sube una foto');
    const id = await nuevoId(db, 'G');
    const o = await db.one('select coalesce(max(orden), 0) + 1 as o from galeria');
    await db.q('insert into galeria(id, foto, texto, orden) values($1,$2,$3,$4)', [id, foto, String(body.texto || '').slice(0, 120), o.o]);
    return json({ id });
  }
  if ((r = p.match(/^\/galeria\/([\w-]+)$/)) && m === 'POST') {
    if ('visible' in body) await db.q('update galeria set visible = $2 where id = $1', [r[1], !!body.visible]);
    if ('texto' in body) await db.q('update galeria set texto = $2 where id = $1', [r[1], String(body.texto).slice(0, 120)]);
    return json({ ok: true });
  }
  if ((r = p.match(/^\/galeria\/([\w-]+)\/borrar$/)) && m === 'POST') {
    await db.q('delete from galeria where id = $1', [r[1]]);
    return json({ ok: true });
  }
  return null;
}
