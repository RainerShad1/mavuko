// Genera el SQL para crear (o cambiar la clave de) un usuario del panel.
// Uso: npm run usuario -- <usuario> "<Nombre visible>" <director|secretaria> [clave]
import { hashClave, aleatorio } from '../src/auth.js';
const [usuario, nombre, rol = 'secretaria', claveArg] = process.argv.slice(2);
if (!usuario || !nombre) { console.error('Uso: npm run usuario -- <usuario> "<Nombre>" <director|secretaria> [clave]'); process.exit(1); }
const clave = claveArg || aleatorio(5);
const sal = aleatorio(8);
const hash = await hashClave(clave, sal);
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
console.log(`-- Usuario: ${usuario}  Clave: ${clave}`);
console.log(`insert into usuarios(usuario, nombre, rol, hash, sal) values(${esc(usuario.toLowerCase())}, ${esc(nombre)}, ${esc(rol)}, ${esc(hash)}, ${esc(sal)}) on conflict (usuario) do update set hash = excluded.hash, sal = excluded.sal, nombre = excluded.nombre, rol = excluded.rol;`);
