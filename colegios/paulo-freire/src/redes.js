// Publicación en Facebook (página) e Instagram (cuenta profesional vinculada a la página)
// con la API Graph de Meta. Variables: FB_PAGE_ID, FB_PAGE_TOKEN, IG_USER_ID.
// Sin esas variables, la publicación queda como "simulado".

const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v23.0'}`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(env, ruta, params) {
  const body = new URLSearchParams({ ...params, access_token: env.FB_PAGE_TOKEN });
  const r = await fetch(`${graph(env)}/${ruta}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Meta respondió ${r.status}`);
  return j;
}
async function get(env, ruta, campos) {
  const r = await fetch(`${graph(env)}/${ruta}?fields=${campos}&access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`);
  return r.json().catch(() => ({}));
}

export const redesConectadas = (env) => ({
  fb: !!(env.FB_PAGE_ID && env.FB_PAGE_TOKEN),
  ig: !!(env.IG_USER_ID && env.FB_PAGE_TOKEN),
});

export function textoPublicacion(p, sitio) {
  return `${p.titulo}\n\n${p.texto}`.trim() + (sitio ? `\n\nMás en ${sitio}` : '') + '\n\n#ColegioPauloFreire #LaRomana';
}

export async function publicarFacebook(env, p, urls, sitio) {
  if (!redesConectadas(env).fb) return { estado: 'simulado' };
  const message = textoPublicacion(p, sitio);
  let id;
  if (!urls.length) id = (await post(env, `${env.FB_PAGE_ID}/feed`, { message })).id;
  else if (urls.length === 1) { const r = await post(env, `${env.FB_PAGE_ID}/photos`, { url: urls[0], caption: message }); id = r.post_id || r.id; }
  else {
    const ids = [];
    for (const url of urls.slice(0, 10)) ids.push((await post(env, `${env.FB_PAGE_ID}/photos`, { url, published: 'false' })).id);
    const params = { message };
    ids.forEach((m, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: m }); });
    id = (await post(env, `${env.FB_PAGE_ID}/feed`, params)).id;
  }
  return { estado: 'publicado', link: `https://www.facebook.com/${id}` };
}

async function listo(env, contenedor) {
  for (let i = 0; i < 10; i++) {
    const s = await get(env, contenedor, 'status_code');
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram no pudo procesar la foto');
    await esperar(1500);
  }
}

export async function publicarInstagram(env, p, urlsIg) {
  if (!redesConectadas(env).ig) return { estado: 'simulado' };
  if (!urlsIg.length) throw new Error('Instagram necesita al menos una foto');
  const caption = textoPublicacion(p);
  let contenedor;
  if (urlsIg.length === 1) {
    contenedor = (await post(env, `${env.IG_USER_ID}/media`, { image_url: urlsIg[0], caption })).id;
  } else {
    const hijos = [];
    for (const image_url of urlsIg.slice(0, 10)) hijos.push((await post(env, `${env.IG_USER_ID}/media`, { image_url, is_carousel_item: 'true' })).id);
    for (const h of hijos) await listo(env, h);
    contenedor = (await post(env, `${env.IG_USER_ID}/media`, { media_type: 'CAROUSEL', children: hijos.join(','), caption })).id;
  }
  await listo(env, contenedor);
  const media = (await post(env, `${env.IG_USER_ID}/media_publish`, { creation_id: contenedor })).id;
  const info = await get(env, media, 'permalink');
  return { estado: 'publicado', link: info.permalink || null };
}
