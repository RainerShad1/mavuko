// Login del panel: contraseñas con PBKDF2 y sesiones guardadas en la base de datos.
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export async function hashClave(clave, sal) {
  const key = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: 100000 },
    key,
    256
  );
  return b64(bits);
}

export function aleatorio(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const DURACION = 7 * 864e5;

export async function login(db, usuario, clave) {
  const u = await db.one('select * from usuarios where usuario = $1', [String(usuario || '').trim().toLowerCase()]);
  if (!u) return null;
  const h = await hashClave(String(clave || ''), u.sal);
  if (!igual(h, u.hash)) return null;
  const token = aleatorio(32);
  await db.q('delete from sesiones where expira < now()');
  await db.q('insert into sesiones(token, usuario_id, expira) values($1, $2, $3)', [token, u.id, new Date(Date.now() + DURACION).toISOString()]);
  return { token, usuario: { nombre: u.nombre, rol: u.rol, usuario: u.usuario } };
}

export function leerCookie(req, nombre) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? m[1] : null;
}

export async function usuarioActual(db, req) {
  const token = leerCookie(req, 'sid');
  if (!token) return null;
  return db.one(
    'select u.id, u.nombre, u.rol, u.usuario from sesiones s join usuarios u on u.id = s.usuario_id where s.token = $1 and s.expira > now()',
    [token]
  );
}

export async function logout(db, req) {
  const token = leerCookie(req, 'sid');
  if (token) await db.q('delete from sesiones where token = $1', [token]);
}

export function cookieSesion(token, segura = true) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACION / 1000}${segura ? '; Secure' : ''}`;
}
