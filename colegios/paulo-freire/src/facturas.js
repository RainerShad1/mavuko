// Facturación interna del colegio.
// Son facturas de control (NO son comprobantes fiscales e-CF de la DGII).
// Los campos ncf y fiscal quedan reservados para conectar más adelante un proveedor de e-CF.
import { COLEGIO } from './colegio.js';
import { meses, mesLargo, rd, cap, aplica } from './cobros.js';
import { nuevoRecibo, leerConfig } from './db.js';

export const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'];

export const CONCEPTOS_BASE = [
  { n: 'Inscripción', p: 6000 },
  { n: 'Libros y materiales', p: 3500 },
  { n: 'Uniforme (polo)', p: 850 },
  { n: 'Uniforme completo', p: 2200 },
  { n: 'Transporte escolar', p: 2500 },
  { n: 'Excursión', p: 1500 },
  { n: 'Graduación', p: 4000 },
];

export async function conceptos(db) {
  const c = await leerConfig(db);
  return Array.isArray(c.conceptos) ? c.conceptos : CONCEPTOS_BASE;
}

export const numFactura = (n) => 'FAC-' + String(n).padStart(6, '0');
export const tokenNuevo = () => {
  const b = crypto.getRandomValues(new Uint8Array(15));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
};
export const urlFactura = (base, token) => `${base}/f/${token}`;
export const baseURL = (env) => (env.PUBLIC_URL || env.ORIGEN || COLEGIO.web).replace(/\/$/, '');

const entero = (v, min = 0, max = 10_000_000) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

/**
 * Valida y completa las líneas de una factura.
 * Línea de mensualidad: { est, mes } → el precio sale de la tarifa del nivel (no se puede cambiar).
 * Línea libre: { d, cant, precio }.
 */
export async function prepararLineas(db, lineas) {
  if (!Array.isArray(lineas) || !lineas.length) throw new Error('Agrega al menos una línea');
  if (lineas.length > 40) throw new Error('Demasiadas líneas');
  const orden = meses().map((m) => m.k);
  const out = [];
  const vistos = new Set();
  for (const l of lineas) {
    if (l.est && l.mes) {
      const e = await db.one('select * from estudiantes where id = $1', [l.est]);
      if (!e) throw new Error('Estudiante no encontrado');
      if (!orden.includes(l.mes)) throw new Error('Mes inválido');
      if (!aplica(e, l.mes)) throw new Error(`${e.nombre} se inscribió para pagar desde ${mesLargo(e.desde)}`);
      const k = e.id + '|' + l.mes;
      if (vistos.has(k)) throw new Error(`${cap(mesLargo(l.mes))} de ${e.nombre} está repetido`);
      vistos.add(k);
      const precio = COLEGIO.tarifas[e.nivel];
      out.push({ d: `Mensualidad ${mesLargo(l.mes)} · ${e.nombre} (${e.grado})`, cant: 1, precio, est: e.id, mes: l.mes, fam: e.familia_id });
    } else {
      const d = String(l.d || '').trim().slice(0, 120);
      const cant = entero(l.cant ?? 1, 1, 999), precio = entero(l.precio, 0);
      if (!d) throw new Error('Una línea no tiene descripción');
      if (cant === null || precio === null) throw new Error(`Revisa la cantidad y el precio de "${d}"`);
      out.push({ d, cant, precio });
    }
  }
  return out;
}

async function mesesYaPagados(db, lineas) {
  const ms = lineas.filter((l) => l.est);
  if (!ms.length) return [];
  const rows = await db.q('select estudiante_id, mes from pagos where estudiante_id = any($1::text[])', [[...new Set(ms.map((l) => l.est))]]);
  const p = new Set(rows.map((r) => r.estudiante_id + '|' + r.mes));
  return ms.filter((l) => p.has(l.est + '|' + l.mes));
}

// Registra en "pagos" las mensualidades de la factura (para el estado de cuenta)
async function aplicarMensualidades(db, lineas, metodo, ref, recibo) {
  const ms = lineas.filter((l) => l.est);
  if (!ms.length) return null;
  const rec = recibo || (await nuevoRecibo(db));
  await db.q(
    `insert into pagos(recibo, estudiante_id, mes, monto, metodo, ref)
     select $1, x.est, x.mes, x.precio, $2, $3 from jsonb_to_recordset($4::jsonb) as x(est text, mes text, precio int)
     on conflict (estudiante_id, mes) do nothing`,
    [rec, metodo, ref || '', JSON.stringify(ms)]
  );
  return rec;
}

/**
 * Crea una factura. pagada=false deja la factura "pendiente" (por cobrar) y no marca meses como pagados.
 * Devuelve la factura guardada.
 */
export async function crearFactura(db, d) {
  const lineas = await prepararLineas(db, d.lineas);
  const famIds = [...new Set(lineas.filter((l) => l.fam).map((l) => l.fam))];
  let famId = d.fam || famIds[0] || null;
  if (famIds.some((x) => x !== famId)) throw new Error('Las mensualidades deben ser de estudiantes de la misma familia');
  const f = famId ? await db.one('select * from familias where id = $1', [famId]) : null;
  if (famId && !f) throw new Error('Familia no encontrada');
  const cliente = String(d.cliente || f?.tutor || '').trim().slice(0, 100);
  if (!cliente) throw new Error('Escribe a nombre de quién va la factura');
  const doc = String(d.doc ?? f?.doc ?? '').replace(/[^\d-]/g, '').slice(0, 13) || null;
  const subtotal = lineas.reduce((s, l) => s + l.cant * l.precio, 0);
  const descuento = entero(d.descuento || 0, 0, subtotal);
  if (descuento === null) throw new Error('El descuento no puede ser mayor que el subtotal');
  const total = subtotal - descuento;
  const pagada = d.pagada !== false;
  const metodo = pagada ? (METODOS.includes(d.metodo) ? d.metodo : 'Efectivo') : null;
  const ref = String(d.ref || '').trim().slice(0, 60);

  const dobles = await mesesYaPagados(db, lineas);
  if (dobles.length) throw new Error(`Ya está pagado: ${dobles.map((l) => l.d.split(' · ')[0].replace('Mensualidad ', '') + ' de ' + l.d.split(' · ')[1]).join(', ')}`);

  const recibo = pagada ? await aplicarMensualidades(db, lineas, metodo, ref, d.recibo) : null;
  const n = (await db.one("select nextval('sec_factura') as n")).n;
  const fac = {
    id: numFactura(n), token: tokenNuevo(), familia_id: famId, cliente, doc, tel: f?.tel || null,
    items: lineas.map(({ fam, ...l }) => l), subtotal, descuento, total, metodo, ref, recibo,
    estado: pagada ? 'pagada' : 'pendiente', nota: String(d.nota || '').trim().slice(0, 300) || null, usuario: d.usuario || null,
  };
  await db.q(
    `insert into facturas(id, token, familia_id, cliente, doc, tel, items, subtotal, descuento, total, metodo, ref, recibo, estado, nota, usuario, pagada_en)
     values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16, case when $14 = 'pagada' then now() end)`,
    [fac.id, fac.token, fac.familia_id, fac.cliente, fac.doc, fac.tel, JSON.stringify(fac.items), subtotal, descuento, total, metodo, ref, recibo, fac.estado, fac.nota, fac.usuario]
  );
  // Guardar la cédula/RNC en la familia para la próxima vez
  if (f && doc && doc !== f.doc && d.guardarDoc !== false) await db.q('update familias set doc = $2 where id = $1', [f.id, doc]);
  return db.one('select * from facturas where id = $1', [fac.id]);
}

// Cobrar una factura que estaba pendiente
export async function cobrarFactura(db, id, metodo, ref) {
  const f = await db.one('select * from facturas where id = $1', [id]);
  if (!f) throw new Error('Factura no encontrada');
  if (f.estado !== 'pendiente') throw new Error('Esta factura no está pendiente de cobro');
  const met = METODOS.includes(metodo) ? metodo : 'Efectivo';
  const dobles = await mesesYaPagados(db, f.items);
  if (dobles.length) throw new Error('Algún mes de esta factura ya se pagó por otro lado. Anúlala y crea otra.');
  const recibo = await aplicarMensualidades(db, f.items, met, ref);
  await db.q("update facturas set estado = 'pagada', metodo = $2, ref = $3, recibo = $4, pagada_en = now() where id = $1", [id, met, String(ref || '').slice(0, 60), recibo]);
  return db.one('select * from facturas where id = $1', [id]);
}

// Anular: la factura queda guardada (no se borra) y las mensualidades vuelven a quedar pendientes
export async function anularFactura(db, id, motivo, usuario) {
  const f = await db.one('select * from facturas where id = $1', [id]);
  if (!f) throw new Error('Factura no encontrada');
  if (f.estado === 'anulada') throw new Error('La factura ya está anulada');
  const m = String(motivo || '').trim().slice(0, 150);
  if (!m) throw new Error('Escribe el motivo de la anulación');
  if (f.recibo) {
    const ms = f.items.filter((l) => l.est);
    for (const l of ms) await db.q('delete from pagos where recibo = $1 and estudiante_id = $2 and mes = $3', [f.recibo, l.est, l.mes]);
  }
  await db.q("update facturas set estado = 'anulada', motivo = $2, anulada_por = $3, anulada_en = now() where id = $1", [id, m, usuario || null]);
  return db.one('select * from facturas where id = $1', [id]);
}

export function facturaJSON(f) {
  return {
    id: f.id, token: f.token, fam: f.familia_id, cliente: f.cliente, doc: f.doc, items: f.items, subtotal: f.subtotal, descuento: f.descuento,
    total: f.total, metodo: f.metodo, ref: f.ref, recibo: f.recibo, estado: f.estado, motivo: f.motivo, nota: f.nota, usuario: f.usuario,
    fecha: new Date(f.fecha).toISOString(), ncf: f.ncf,
  };
}

// Mensaje de WhatsApp con el enlace a la factura
export function textoFactura(f, base) {
  const nom = String(f.cliente).split(' ')[0];
  const det = f.items.length === 1 ? f.items[0].d : `${f.items[0].d} y ${f.items.length - 1} concepto${f.items.length > 2 ? 's' : ''} más`;
  const url = urlFactura(base, f.token);
  if (f.estado === 'pendiente') return `🧾 Hola, ${nom}. Le compartimos la factura *${f.id}* por *${rd(f.total)}*.\nConcepto: ${det}\nEstá *pendiente de pago*. Puede pagar en la secretaría o por transferencia y enviarnos el comprobante por aquí.\n\nVer factura: ${url}`;
  return `✅ Hola, ${nom}. Recibimos su pago de *${rd(f.total)}*.\nConcepto: ${det}\nFactura: *${f.id}*\n\nVer o descargar: ${url}\n¡Gracias! 🙌`;
}

const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fechaLarga = (d) => new Date(new Date(d).getTime() + COLEGIO.zonaHoraria * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('/');

// Página imprimible de la factura (se abre desde el enlace de WhatsApp o desde el panel)
export function paginaFactura(f) {
  const sello = { pagada: ['PAGADA', '#12603F'], pendiente: ['PENDIENTE DE PAGO', '#B7791F'], anulada: ['ANULADA', '#C8202F'] }[f.estado];
  const filas = f.items.map((l) => `<tr><td>${escH(l.d)}</td><td class="n">${l.cant}</td><td class="n">${rd(l.precio)}</td><td class="n">${rd(l.cant * l.precio)}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Factura ${escH(f.id)} · ${escH(COLEGIO.nombre)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#EDF2F8;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2433}
.hoja{max-width:760px;margin:24px auto;background:#fff;border-radius:14px;padding:36px 40px;box-shadow:0 10px 30px rgba(11,43,91,.10);position:relative;overflow:hidden}
.cab{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #0B2B5B;padding-bottom:18px}
.esc{display:flex;gap:14px;align-items:center}.esc img{width:58px;height:auto}.esc b{display:block;font-size:19px;color:#0B2B5B}.esc small{display:block;color:#5b6577;font-size:12.5px}
.num{text-align:right}.num h1{margin:0;font-size:22px;letter-spacing:.06em;color:#0B2B5B}.num b{font-size:17px}.num small{display:block;color:#5b6577}
.dat{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin:22px 0}.dat small{display:block;color:#5b6577;font-size:12px;text-transform:uppercase;letter-spacing:.05em}.dat span{font-weight:600}
table{width:100%;border-collapse:collapse}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5b6577;text-align:left;border-bottom:1px solid #d9e0ea;padding:8px 6px}
td{padding:10px 6px;border-bottom:1px solid #eef1f6}.n{text-align:right;white-space:nowrap}
.tot{margin-left:auto;width:min(300px,100%);margin-top:14px}.tot div{display:flex;justify-content:space-between;padding:5px 6px}.tot .g{border-top:2px solid #0B2B5B;margin-top:4px;padding-top:10px;font-size:19px;font-weight:800;color:#0B2B5B}
.sello{display:inline-block;margin-top:10px;transform:rotate(-4deg);border:3px solid ${sello[1]};color:${sello[1]};font-weight:800;letter-spacing:.1em;padding:4px 14px;border-radius:8px;font-size:14px}
.nota{margin-top:20px;background:#f6f8fb;border-radius:10px;padding:12px 14px;font-size:13.5px}
.pie{margin-top:26px;font-size:12px;color:#5b6577;border-top:1px dashed #cfd6e2;padding-top:12px}
.acc{max-width:760px;margin:0 auto 30px;display:flex;gap:10px;justify-content:center}.acc button,.acc a{border:0;border-radius:999px;padding:11px 20px;font:600 14px system-ui;cursor:pointer;text-decoration:none}
.p{background:#0B2B5B;color:#fff}.w{background:#25D366;color:#fff}
@media (max-width:560px){.hoja{margin:0;border-radius:0;padding:24px 18px}.cab{flex-direction:column}.num{text-align:left}.dat{grid-template-columns:1fr}}
@media print{body{background:#fff}.hoja{box-shadow:none;margin:0;max-width:none}.acc{display:none}}
</style></head><body>
<div class="hoja">
 <div class="cab"><div class="esc"><img src="/assets/monograma.png" alt=""><div><b>${escH(COLEGIO.nombreLargo)}</b><small>${escH(COLEGIO.direccion)}</small><small>Tel. ${escH(COLEGIO.telefonoOficina)} · WhatsApp ${escH(COLEGIO.telefono)}${COLEGIO.rnc ? ' · RNC ' + escH(COLEGIO.rnc) : ''}</small></div></div>
 <div class="num"><h1>FACTURA</h1><b>${escH(f.id)}</b><small>Fecha: ${fechaLarga(f.fecha)}</small>${f.ncf ? `<small>NCF: ${escH(f.ncf)}</small>` : ''}<div class="sello">${sello[0]}</div></div></div>
 <div class="dat"><div><small>Facturado a</small><span>${escH(f.cliente)}</span></div><div><small>Cédula / RNC</small><span>${escH(f.doc || '—')}</span></div>
  <div><small>Forma de pago</small><span>${escH(f.metodo || 'Pendiente')}${f.ref ? ' · Ref. ' + escH(f.ref) : ''}</span></div><div><small>Recibo</small><span>${escH(f.recibo || '—')}</span></div></div>
 <table><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead><tbody>${filas}</tbody></table>
 <div class="tot"><div><span>Subtotal</span><span>${rd(f.subtotal)}</span></div>${f.descuento ? `<div><span>Descuento</span><span>−${rd(f.descuento)}</span></div>` : ''}<div class="g"><span>Total</span><span>${rd(f.total)}</span></div></div>
 ${f.nota ? `<div class="nota">${escH(f.nota)}</div>` : ''}
 ${f.estado === 'anulada' ? `<div class="nota" style="background:#fdecee;color:#8a1520">Factura anulada${f.motivo ? ': ' + escH(f.motivo) : ''}.</div>` : ''}
 <div class="pie">${f.ncf ? 'Comprobante fiscal electrónico.' : 'Documento interno de control de pagos. No es un comprobante fiscal (e-CF) de la DGII.'} Gracias por confiar en ${escH(COLEGIO.nombre)}.</div>
</div>
<div class="acc"><button class="p" onclick="print()">Imprimir o guardar PDF</button><a class="p" href="?t=80" style="background:#56637A">Ticket 80 mm</a><a class="w" href="https://wa.me/${COLEGIO.whatsapp}" target="_blank" rel="noopener">Escribir al colegio</a></div>
</body></html>`;
}

// Versión para impresora térmica de 80 mm (ancho útil ~72 mm)
export function ticketFactura(f, { imprimir = false } = {}) {
  const t = new Date(new Date(f.fecha).getTime() + COLEGIO.zonaHoraria * 3600e3).toISOString();
  const fecha = t.slice(0, 10).split('-').reverse().join('/'), hora = t.slice(11, 16);
  const est = { pagada: 'PAGADA', pendiente: 'PENDIENTE DE PAGO', anulada: '*** ANULADA ***' }[f.estado];
  const lineas = f.items.map((l) => `<div class="it"><div>${escH(l.d)}</div><div class="fila"><span>${l.cant} x ${rd(l.precio)}</span><span>${rd(l.cant * l.precio)}</span></div></div>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Ticket ${escH(f.id)}</title>
<style>
@page{size:80mm auto;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000}
body{width:80mm;padding:4mm 4mm 6mm;font:12px/1.35 "Courier New",ui-monospace,monospace}
.c{text-align:center}.b{font-weight:700}.g{font-size:15px}
img{width:16mm;filter:grayscale(1) contrast(1.4);display:block;margin:0 auto 2mm}
hr{border:0;border-top:1px dashed #000;margin:2.5mm 0}
.fila{display:flex;justify-content:space-between;gap:3mm}.fila span:last-child{white-space:nowrap}
.it{margin-bottom:1.5mm}
.tot{font-size:15px;font-weight:700}
.est{border:1.5px solid #000;padding:1mm;margin:2mm 0;text-align:center;font-weight:700;letter-spacing:.05em}
.peq{font-size:10.5px}
.acc{margin-top:6mm;display:flex;gap:2mm}.acc button{flex:1;padding:3mm;font:600 13px system-ui;border:0;border-radius:6px;background:#0B2B5B;color:#fff;cursor:pointer}
@media screen{html{background:#e9edf3}body{margin:16px auto;box-shadow:0 4px 18px rgba(0,0,0,.12)}}
@media print{.acc{display:none}}
</style></head><body>
<img src="/assets/monograma.png" alt="">
<div class="c b">${escH(COLEGIO.nombreLargo.toUpperCase())}</div>
${COLEGIO.rnc ? `<div class="c">RNC ${escH(COLEGIO.rnc)}</div>` : ''}
<div class="c peq">${escH(COLEGIO.direccion)}</div>
<div class="c peq">Tel. ${escH(COLEGIO.telefonoOficina)} · WA ${escH(COLEGIO.telefono)}</div>
<hr>
<div class="c b g">FACTURA ${escH(f.id)}</div>
<div class="fila"><span>Fecha: ${fecha}</span><span>${hora}</span></div>
${f.recibo ? `<div>Recibo: ${escH(f.recibo)}</div>` : ''}
${f.usuario ? `<div>Atendió: ${escH(f.usuario)}</div>` : ''}
<hr>
<div>Cliente: ${escH(f.cliente)}</div>
${f.doc ? `<div>Céd./RNC: ${escH(f.doc)}</div>` : ''}
<hr>
${lineas}
<hr>
<div class="fila"><span>Subtotal</span><span>${rd(f.subtotal)}</span></div>
${f.descuento ? `<div class="fila"><span>Descuento</span><span>-${rd(f.descuento)}</span></div>` : ''}
<div class="fila tot"><span>TOTAL</span><span>${rd(f.total)}</span></div>
<div class="fila"><span>Pago</span><span>${escH(f.metodo || 'Pendiente')}</span></div>
${f.ref ? `<div class="fila"><span>Ref.</span><span>${escH(f.ref)}</span></div>` : ''}
<div class="est">${est}</div>
${f.nota ? `<div class="peq">${escH(f.nota)}</div>` : ''}
${f.estado === 'anulada' && f.motivo ? `<div class="peq">Motivo: ${escH(f.motivo)}</div>` : ''}
<hr>
<div class="c peq">${f.ncf ? 'NCF ' + escH(f.ncf) : 'Documento interno de control. No es comprobante fiscal (e-CF).'}</div>
<div class="c" style="margin-top:2mm">¡Gracias por su pago!</div>
<div class="acc"><button onclick="print()">Imprimir</button></div>
${imprimir ? '<script>addEventListener("load",()=>setTimeout(()=>print(),300))</script>' : ''}
</body></html>`;
}

// Las últimas facturas de una familia (para el asistente de WhatsApp)
export async function facturasDeFamilia(db, famId, n = 5) {
  return db.q("select * from facturas where familia_id = $1 and estado <> 'anulada' order by fecha desc limit $2", [famId, n]);
}
