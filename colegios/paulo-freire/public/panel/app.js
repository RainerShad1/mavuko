// Panel administrativo del colegio. Lee y escribe en la API (/api/*).
'use strict';

// ================= Estado y utilidades =================
let DB = null, META = null;
let MESES = [], MES_LARGO = {}, TARIFA = {}, GRADOS = [], HOY = '', CUR = '', C_UTIL = 0.0113, C_MKT = 0.074;
const VENT = 24 * 3600e3;
const $ = (s) => document.querySelector(s);
const rd = (n) => 'RD$' + Number(n).toLocaleString('en-US');
const usd = (n) => 'US$' + n.toFixed(2);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Texto con formato de WhatsApp (*negrita*, _cursiva_) a HTML seguro
const fmtWA = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_/g, '$1<i style="position:static;font-size:inherit">$2</i>');
const fmtF = (d) => new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
const horaDe = (d) => new Date(d).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
const hora = () => horaDe(Date.now());
const venceDe = (k) => `${k}-${String(META.diaVence).padStart(2, '0')}`;
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const ddmm = (k) => `${venceDe(k).slice(8)}/${k.slice(5)}`;

async function api(path, body) {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', 'x-panel': '1' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Inicia sesión'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
}
// Ejecuta una acción del panel mostrando errores y recargando datos
async function act(btn, fn) {
  if (btn) btn.classList.add('busy');
  try { await fn(); } catch (e) { if (e.message !== 'Inicia sesión') toast('⚠️ ' + e.message); }
  finally { if (btn) btn.classList.remove('busy'); }
}

async function load() {
  const d = await api('/state');
  DB = d; META = d.meta;
  MESES = META.meses.map((m) => [m.k, m.abrev]);
  MES_LARGO = Object.fromEntries(META.meses.map((m) => [m.k, m.largo]));
  TARIFA = META.tarifas; GRADOS = META.grados; HOY = META.hoy; CUR = META.cur; C_UTIL = META.costoUtil; C_MKT = META.costoMkt;
  renderAll();
}

const fam = (id) => DB.fams.find((f) => f.id === id);
const stu = (id) => DB.stus.find((s) => s.id === id);
const hijosDe = (id) => DB.stus.filter((s) => s.fam === id);

// ================= Lógica de cobros (igual que src/cobros.js) =================
let PAGADOS = new Set();
const paid = (e, k) => PAGADOS.has(e + '|' + k);
function estadoEst(e) {
  const vencidos = [], porVencer = [];
  MESES.forEach(([k]) => {
    if (paid(e.id, k)) return;
    const v = venceDe(k);
    if (v < HOY) vencidos.push(k); else if (dias(HOY, v) <= 31) porVencer.push(k);
  });
  return { vencidos, porVencer };
}
function estadoFam(f) {
  const hijos = hijosDe(f.id); let mora = 0, pend = 0; const mesesMora = [], mesesPend = [];
  hijos.forEach((h) => { const s = estadoEst(h); mora += s.vencidos.length * TARIFA[h.nivel]; pend += s.porVencer.length * TARIFA[h.nivel]; s.vencidos.forEach((m) => mesesMora.push([h, m])); s.porVencer.forEach((m) => mesesPend.push([h, m])); });
  return { hijos, mora, pend, st: mora > 0 ? 'bad' : pend > 0 ? 'warn' : 'ok', mesesMora, mesesPend };
}
const proxVence = () => MESES.map(([k]) => k).find((k) => venceDe(k) >= HOY) || CUR;
const PILL = { ok: ['p-ok', 'Al día'], warn: ['p-warn', 'Por vencer'], bad: ['p-bad', 'En mora'] };
const pill = (st) => `<span class="pill ${PILL[st][0]}">${PILL[st][1]}</span>`;
const ini = (n) => String(n).split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('');
const colorAv = (id) => ['#04234d', '#035036', '#0b3366', '#7a5a1e', '#1f5f8b', '#0a6b4a'][(parseInt(String(id).replace(/\D/g, '').slice(-4)) || 0) % 6];
function ultimoMsg(c) { const l = (DB.lastIn || {})[c.fam]; return l && l > c.fecha ? l : c.fecha; }
function ventana(c) {
  const base = ultimoMsg(c), renov = base !== c.fecha;
  const rest = new Date(base).getTime() + VENT - Date.now();
  if (rest <= 0) return { open: false, html: `<div class="vent v-off"><div class="vt"><b>⛔ Ventana de 24 h cerrada</b><span>hace ${dur(-rest)}</span></div><div class="vbar"><i style="width:0"></i></div><small>${META.plantilla ? `El recibo se enviará como plantilla de utilidad (≈US$${C_UTIL}).` : 'Para enviar el recibo fuera de la ventana hace falta una plantilla aprobada por Meta. El pago sí se registra.'}</small></div>` };
  const pct = rest / VENT * 100; const cls = rest < 3600e3 ? 'v-bad' : rest < 6 * 3600e3 ? 'v-warn' : 'v-ok';
  return { open: true, rest, html: `<div class="vent ${cls}"><div class="vt"><b>⏱️ Quedan ${dur(rest)}</b><span>para responder dentro de la ventana de WhatsApp</span>${renov ? '<span class="pill p-info" style="margin-left:auto">↻ Renovada</span>' : ''}</div><div class="vbar"><i style="width:${pct}%"></i></div><small>Cierra a las ${horaDe(new Date(base).getTime() + VENT)} del ${fmtF(new Date(base).getTime() + VENT)}. Dentro de la ventana el recibo se envía como mensaje de servicio.</small></div>` };
}
function dur(ms) { const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; }
function voucherHTML(c) {
  if (c.img) return `<a href="/api/comprobantes/${c.id}/imagen" target="_blank" rel="noopener"><img class="vimg" src="/api/comprobantes/${c.id}/imagen" alt="Comprobante enviado por WhatsApp" loading="lazy"></a>`;
  return `<div class="voucher"><b>🏦 ${esc(c.banco || 'Transferencia')}</b>Ejemplo de prueba<div class="vm">${rd(c.monto)}</div><div><span>Destino</span><span>Col. Paulo Freire</span></div><div><span>Ref.</span><span>${esc(c.ref || '—')}</span></div><div><span>Fecha</span><span>${new Date(c.fecha).toLocaleDateString('es-DO')}</span></div></div>`;
}
const resEnvio = (r, ok) => r.estado === 'Simulado' ? ok + ' (simulado: familia de prueba)' : r.estado === 'Falló' ? '⚠️ No se pudo enviar por WhatsApp: ' + (r.error || '') : ok + ' ✅';

// ================= Panel =================
function renderPanel() {
  const fs = DB.fams.map((f) => ({ f, ...estadoFam(f) }));
  const h = new Date().getHours();
  $('#saludo').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${DB.user.nombre} 👋`;
  $('#kEst').textContent = DB.stus.length; $('#kFam').textContent = DB.fams.length + ' familias';
  const esp = DB.stus.reduce((a, e) => a + TARIFA[e.nivel], 0) || 1;
  const cob = DB.pays.filter((p) => p.mes === CUR).reduce((a, p) => a + p.monto, 0);
  $('#kCobLbl').textContent = 'Cobrado en ' + MES_LARGO[CUR];
  $('#kCob').textContent = rd(cob); $('#kCobSub').textContent = Math.round(cob / esp * 100) + '% de ' + rd(esp); $('#kBar').style.width = Math.min(100, cob / esp * 100) + '%';
  const pend = fs.reduce((a, x) => a + x.pend, 0), mora = fs.reduce((a, x) => a + x.mora, 0);
  const pv = proxVence(); const faltan = Math.round(dias(HOY, venceDe(pv)));
  $('#kPendLbl').textContent = `Por cobrar (vence ${ddmm(pv)})`;
  $('#kPend').textContent = rd(pend); $('#kPendSub').textContent = fs.filter((x) => x.pend > 0).length + ' familias · ' + (faltan === 0 ? 'vence hoy' : faltan === 1 ? 'vence mañana' : `vence en ${faltan} días`);
  $('#kMora').textContent = rd(mora); $('#kMoraSub').textContent = fs.filter((x) => x.st === 'bad').length + ' familias';
  $('#aComp').textContent = DB.comps.filter((c) => c.estado === 'pend').length;
  const urg = DB.comps.filter((c) => c.estado === 'pend' && ventana(c).open && ventana(c).rest < 6 * 3600e3).length;
  $('#aCompSub').textContent = urg ? `Comprobantes por revisar · ${urg} con ventana por cerrar` : 'Comprobantes por revisar';
  $('#aAus').textContent = DB.aus.filter((a) => !a.visto).length;
  $('#aCit').textContent = DB.citas.filter((c) => c.estado === 'pend').length;
  $('#aInt').textContent = DB.ints.filter((c) => c.estado === 'Nuevo').length;
  const iCur = Math.max(0, MESES.findIndex(([k]) => k === CUR));
  const data = MESES.slice(Math.max(0, iCur - 3), iCur + 1).map(([k, n]) => ({ n, got: DB.pays.filter((p) => p.mes === k).reduce((a, p) => a + p.monto, 0) }));
  $('#chart').innerHTML = data.map((d) => `<div class="col"><span class="v">${Math.round(d.got / esp * 100)}%</span><div class="stack"><div class="exp" style="height:100%"></div><div class="got" style="height:${Math.min(100, d.got / esp * 100)}%"></div></div><span class="m">${d.n}</span></div>`).join('');
  const m = fs.filter((x) => x.st === 'bad').sort((a, b) => b.mora - a.mora);
  $('#moraList').innerHTML = m.length ? m.slice(0, 6).map((x) => `<div class="row" data-fam="${x.f.id}" style="cursor:pointer"><div class="av" style="background:${colorAv(x.f.id)}">${esc(ini(x.f.tutor))}</div><div class="who"><b>${esc(x.f.tutor)}</b><span>${[...new Set(x.mesesMora.map((z) => MES_LARGO[z[1]]))].join(', ')}</span></div><span class="amt" style="color:var(--bad)">${rd(x.mora)}</span></div>`).join('') : '<p class="empty">Nadie en mora 🎉</p>';
  const last = [...DB.pays].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
  $('#lastPays').innerHTML = last.map((p) => { const e = stu(p.est); return `<div class="row"><div class="av" style="background:var(--green)">✓</div><div class="who"><b>${esc(e?.nombre)}</b><span>${p.id} · ${MES_LARGO[p.mes]} · ${p.met}${p.ref === 'WhatsApp' ? ' (vía WhatsApp)' : ''} · ${fmtF(p.fecha)}</span></div><span class="amt">${rd(p.monto)}</span></div>`; }).join('') || '<p class="empty">Sin pagos</p>';
}

// ================= Familias =================
function renderFamilias() {
  const q = $('#q').value.toLowerCase().trim(), fe = $('#fEst').value, fn = $('#fNiv').value;
  const rows = DB.fams.map((f) => ({ f, ...estadoFam(f) })).filter((x) => {
    if (fe && x.st !== fe) return false; if (fn && !x.hijos.some((h) => h.nivel === fn)) return false;
    if (q && !(x.f.tutor.toLowerCase().includes(q) || x.f.tel.includes(q) || x.hijos.some((h) => h.nombre.toLowerCase().includes(q)))) return false; return true;
  });
  const ord = { bad: 0, warn: 1, ok: 2 }; rows.sort((a, b) => ord[a.st] - ord[b.st] || b.mora - a.mora);
  const real = (f) => f.real ? ' <span class="pill p-info">📱 Vinculado</span>' : '';
  $('#famBody').innerHTML = rows.map((x) => `<tr class="click" data-fam="${x.f.id}"><td><div style="display:flex;gap:10px;align-items:center"><div class="av" style="background:${colorAv(x.f.id)}">${esc(ini(x.f.tutor))}</div><div><b>${esc(x.f.tutor)}</b><div class="kids">${esc(x.f.parent)}</div></div></div></td><td>${x.hijos.map((h) => `${esc(h.nombre)} <span class="kids">· ${esc(h.grado)}</span>`).join('<br>')}</td><td>${esc(x.f.tel)}${real(x.f)}</td><td>${pill(x.st)}</td><td style="text-align:right" class="amt">${x.mora + x.pend ? rd(x.mora + x.pend) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin resultados</td></tr>';
  $('#famCards').innerHTML = rows.map((x) => `<div class="row" data-fam="${x.f.id}" style="cursor:pointer"><div class="av" style="background:${colorAv(x.f.id)}">${esc(ini(x.f.tutor))}</div><div class="who"><b>${esc(x.f.tutor)}</b><span>${x.hijos.map((h) => esc(h.nombre.split(' ')[0]) + ' (' + esc(h.grado) + ')').join(', ')}</span></div><div style="text-align:right">${pill(x.st)}<div class="amt" style="font-size:12.5px;margin-top:4px">${x.mora + x.pend ? rd(x.mora + x.pend) : ''}</div></div></div>`).join('') || '<p class="empty">Sin resultados</p>';
}
let curFam = null;
function openFam(id) {
  curFam = id; const f = fam(id); if (!f) return; const s = estadoFam(f);
  $('#dAv').textContent = ini(f.tutor); $('#dAv').style.background = colorAv(f.id);
  $('#dName').textContent = f.tutor; $('#dSub').innerHTML = `${esc(f.parent)} · ${esc(f.tel)} · ${pill(s.st)}`;
  $('#dBody').innerHTML = `<div class="kpis" style="grid-template-columns:1fr 1fr;margin-bottom:14px"><div class="kpi r"><small>En mora</small><b>${rd(s.mora)}</b></div><div class="kpi"><small>Por vencer</small><b>${rd(s.pend)}</b></div></div>` +
    s.hijos.map((h) => { const es = estadoEst(h); return `<div class="stu"><h3>${esc(h.nombre)}</h3><div class="g">${esc(h.grado)} · Mensualidad ${rd(TARIFA[h.nivel])}</div><div class="months">${MESES.map(([k, n]) => { let c, t; if (paid(h.id, k)) { c = 'ok'; t = 'Pagado'; } else if (venceDe(k) < HOY) { c = 'late'; t = 'Vencido'; } else if (es.porVencer.includes(k)) { c = 'due'; t = 'Vence ' + venceDe(k).slice(8); } else { c = 'fut'; t = '—'; } return `<div class="mo ${c}">${n}<small>${t}</small></div>`; }).join('')}</div></div>`; }).join('') +
    (f.ultimoAviso ? `<p class="sub">Último mensaje enviado: ${esc(f.ultimoAviso)}</p>` : '');
  $('#ov').classList.add('show'); $('#drawer').classList.add('show');
}
function textoEstado(f) {
  const s = estadoFam(f);
  const vis = MESES.filter(([k]) => venceDe(k) <= HOY || s.mesesPend.some((z) => z[1] === k));
  return '📄 *Estado de cuenta*\n' + s.hijos.map((h) => `\n*${h.nombre} · ${h.grado}*\n` + vis.map(([k]) => `${paid(h.id, k) ? '✅' : venceDe(k) < HOY ? '❌' : '⏳'} ${cap(MES_LARGO[k])} — ${paid(h.id, k) ? 'Pagado' : venceDe(k) < HOY ? 'Pendiente' : 'Vence ' + ddmm(k)}`).join('\n')).join('\n') +
    `\n\n${s.mora ? 'Total vencido: *' + rd(s.mora) + '*\n' : ''}${s.pend ? 'Por vencer: *' + rd(s.pend) + '*' : ''}${!s.mora && !s.pend ? '¡Está al día! 🙌' : ''}`;
}

// ================= Pagos =================
function renderPagos() {
  const q = $('#qp').value.toLowerCase().trim(), fm = $('#fMet').value;
  const rows = [...DB.pays].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((p) => ({ p, e: stu(p.est) })).filter((x) => x.e).map((x) => ({ ...x, f: fam(x.e.fam) })).filter((x) => (!fm || x.p.met === fm) && (!q || x.p.id.toLowerCase().includes(q) || x.e.nombre.toLowerCase().includes(q) || x.f.tutor.toLowerCase().includes(q))).slice(0, 100);
  $('#payBody').innerHTML = rows.map(({ p, e }) => `<tr><td><b>${p.id}</b></td><td>${fmtF(p.fecha)}</td><td>${esc(e.nombre)}<div class="kids">${esc(e.grado)}</div></td><td>Mensualidad ${MES_LARGO[p.mes]}</td><td><span class="pill p-mute">${esc(p.met)}</span>${p.ref === 'WhatsApp' ? ' <span class="pill p-ok">WhatsApp</span>' : ''}</td><td style="text-align:right" class="amt">${rd(p.monto)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin resultados</td></tr>';
  $('#payCards').innerHTML = rows.map(({ p, e }) => `<div class="row"><div class="av" style="background:var(--green)">✓</div><div class="who"><b>${esc(e.nombre)}</b><span>${p.id} · ${MES_LARGO[p.mes]} · ${esc(p.met)} · ${fmtF(p.fecha)}</span></div><span class="amt">${rd(p.monto)}</span></div>`).join('') || '<p class="empty">Sin resultados</p>';
}
let sel = [];
function openPay(famId) {
  const pool = famId ? hijosDe(famId) : DB.stus;
  $('#pStu').innerHTML = pool.map((s) => `<option value="${s.id}">${esc(s.nombre)} · ${esc(s.grado)} — ${esc(fam(s.fam).tutor)}</option>`).join(''); $('#pRef').value = '';
  const first = pool.find((s) => MESES.some(([k]) => !paid(s.id, k) && k <= CUR)); if (first) $('#pStu').value = first.id;
  fillMonths(); openModal('#mPay');
}
function fillMonths() {
  const e = stu($('#pStu').value); if (!e) return;
  const es = estadoEst(e); sel = [...es.vencidos, ...es.porVencer];
  $('#pMonths').innerHTML = MESES.map(([k, n]) => `<button class="chk ${sel.includes(k) ? 'on' : ''}" data-m="${k}" ${paid(e.id, k) ? 'disabled' : ''}>${n}${paid(e.id, k) ? ' ✓' : ''}</button>`).join(''); updTot();
}
function updTot() { const e = stu($('#pStu').value); $('#pTot').textContent = rd(sel.length * (e ? TARIFA[e.nivel] : 0)); }
const reciboMsg = (f, e, r) => `✅ Hola, ${f.tutor.split(' ')[0]}. Recibimos su pago de *${rd(r.total)}* por la mensualidad de *${r.meses.map((k) => MES_LARGO[k]).join(', ')}* de ${e.nombre}.\nRecibo: ${r.id}\n¡Gracias por mantenerse al día! 🙌`;
function showRecibo(e, r, met) {
  const f = fam(e.fam); const meses = r.meses.map((k) => MES_LARGO[k]).join(', ');
  $('#recBody').innerHTML = `<div class="rh"><img src="/assets/monograma.png" alt=""><div><b>${esc(META.colegio)}</b><small style="color:var(--muted)">Recibo ${r.id} · ${new Date().toLocaleDateString('es-DO')}</small></div></div>
 <div class="li"><span>Tutor</span><span>${esc(f.tutor)}</span></div><div class="li"><span>Estudiante</span><span>${esc(e.nombre)} (${esc(e.grado)})</span></div><div class="li"><span>Concepto</span><span>Mensualidad: ${meses}</span></div><div class="li"><span>Método</span><span>${esc(met)}</span></div><div class="li" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px;font-weight:800"><span style="color:var(--navy)">Total pagado</span><span>${rd(r.total)}</span></div>`;
  const txt = reciboMsg(f, e, r);
  $('#recWa').innerHTML = fmtWA(txt) + `<i>${hora()}</i>`;
  $('#recSend').onclick = (ev) => act(ev.currentTarget, async () => { const x = await api('/enviar', { fam: f.id, tipo: 'Recibo de pago', texto: txt }); closeAll(); toast(resEnvio(x, 'Recibo enviado')); await load(); });
  openModal('#mRec');
}
function savePay(ev) {
  if (!sel.length) { toast('Selecciona al menos un mes'); return; }
  const e = stu($('#pStu').value); const met = $('#pMet').value;
  act(ev.currentTarget, async () => {
    const r = await api('/pagos', { est: e.id, meses: sel, met, ref: $('#pRef').value });
    await load(); closeAll(); showRecibo(e, r, met);
  });
}

// ================= Comprobantes =================
let ctab = 'pend', rejId = null;
function renderComps() {
  const pend = DB.comps.filter((c) => c.estado === 'pend');
  $('#cPend').textContent = pend.length || ''; $('#bComp').textContent = pend.length || '';
  const list = ctab === 'pend' ? [...pend].sort((a, b) => ultimoMsg(a).localeCompare(ultimoMsg(b))) : DB.comps.filter((c) => c.estado !== 'pend').reverse();
  $('#compList').innerHTML = list.length ? list.map((c) => {
    const f = fam(c.fam), e = stu(c.est); if (!f || !e) return '';
    const v = c.estado === 'pend' ? ventana(c) : null;
    return `<div class="comp">${voucherHTML(c)}<div><div style="display:flex;gap:10px;align-items:center"><div class="av" style="background:${colorAv(f.id)}">${esc(ini(f.tutor))}</div><div class="who"><b>${esc(f.tutor)}</b><span>${esc(f.tel)} · enviado ${fmtF(c.fecha)} ${horaDe(c.fecha)}</span></div>${c.estado === 'pend' ? '<span class="pill p-warn">Por revisar</span>' : c.estado === 'ok' ? '<span class="pill p-ok">Aprobado</span>' : '<span class="pill p-bad">Rechazado</span>'}</div>
   <div class="rec" style="margin-top:12px;border-style:solid"><div class="li"><span>Estudiante</span><span>${esc(e.nombre)} · ${esc(e.grado)}</span></div><div class="li"><span>Paga</span><span>${c.meses.map((k) => cap(MES_LARGO[k] || k)).join(', ')}</span></div><div class="li"><span>Monto esperado</span><span style="font-weight:700">${rd(c.monto)}</span></div>${c.img && c.estado === 'pend' ? '<div class="li"><span>Revisar</span><span>Que el monto y el destino de la foto coincidan</span></div>' : ''}${c.motivo ? `<div class="li"><span>Motivo</span><span>${esc(c.motivo)}</span></div>` : ''}${c.recibo ? `<div class="li"><span>Recibo</span><span>${c.recibo} · enviado como ${c.via || 'servicio'}</span></div>` : ''}</div>
   ${v ? v.html : ''}
   ${c.estado === 'pend' ? `<div class="act"><button class="btn btn-g btn-sm" data-cok="${c.id}">✓ Aprobar y registrar pago</button><button class="btn btn-r btn-sm" data-crej="${c.id}">Rechazar</button></div>` : ''}</div></div>`;
  }).join('') : `<div class="card"><p class="empty">${ctab === 'pend' ? 'No hay comprobantes por revisar ✅<br><small>Los padres los envían por WhatsApp desde el menú del asistente.</small>' : 'Aún no hay comprobantes revisados'}</p></div>`;
}

// ================= Solicitudes =================
let stab = 'ausencias';
function renderSol() {
  const pa = DB.aus.filter((a) => !a.visto).length, pc = DB.citas.filter((c) => c.estado === 'pend').length, ph = DB.humano.filter((h) => !h.ok).length;
  $('#sAus').textContent = pa || ''; $('#sCit').textContent = pc || ''; $('#sHum').textContent = ph || ''; $('#bSol').textContent = (pa + pc + ph) || '';
  document.querySelectorAll('[data-stab]').forEach((b) => b.classList.toggle('on', b.dataset.stab === stab));
  let h = '';
  if (stab === 'ausencias') h = DB.aus.slice().reverse().map((a) => { const e = stu(a.est), f = fam(a.fam); if (!e || !f) return ''; return `<div class="row"><div class="av" style="background:${colorAv(f.id)}">${esc(ini(e.nombre))}</div><div class="who"><b>${esc(e.nombre)} · ${esc(e.grado)}</b><span>${esc(a.motivo)} · reportado por ${esc(f.tutor)} · ${fmtF(a.fecha)} ${a.hora}</span></div>${a.visto ? '<span class="pill p-ok">Visto</span>' : `<button class="btn btn-o btn-sm" data-ausok="${a.id}">Marcar visto</button>`}</div>`; }).join('');
  if (stab === 'citas') h = DB.citas.slice().reverse().map((c) => { const f = fam(c.fam); if (!f) return ''; return `<div class="row"><div class="av" style="background:${colorAv(f.id)}">${esc(ini(f.tutor))}</div><div class="who"><b>${esc(f.tutor)}</b><span>Con ${esc(c.con)} · ${esc(c.dia)} · ${esc(c.hora)}</span></div>${c.estado === 'pend' ? `<button class="btn btn-g btn-sm" data-citok="${c.id}">Confirmar</button>` : '<span class="pill p-ok">Confirmada</span>'}</div>`; }).join('');
  if (stab === 'humano') h = DB.humano.slice().reverse().map((x) => `<div class="row"><div class="av" style="background:${x.fam ? colorAv(x.fam) : '#7a5a1e'}">${esc(ini(x.nombre))}</div><div class="who"><b>${esc(x.nombre)}</b><span>“${esc(x.texto)}” · ${x.hora}</span></div>${x.ok ? '<span class="pill p-ok">Atendido</span>' : `<button class="btn btn-w btn-sm" data-chat="${x.tel}">💬 Responder</button><button class="btn btn-o btn-sm" data-humok="${x.id}">✓ Atendido</button>`}</div>`).join('');
  $('#solList').innerHTML = h || '<p class="empty">Nada por aquí todavía.</p>';
}

// ================= Interesados =================
const EST_INT = ['Nuevo', 'Contactado', 'Visita agendada', 'Inscrito', 'Descartado'];
function renderInt() {
  const n = DB.ints.filter((i) => i.estado === 'Nuevo').length; $('#bInt').textContent = n || '';
  const rows = DB.ints.slice().reverse();
  const s = (i) => `<select class="selst" data-int="${i.id}">${EST_INT.map((x) => `<option ${x === i.estado ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  $('#intBody').innerHTML = rows.map((i) => `<tr><td><b>${esc(i.nombre)}</b></td><td>${esc(i.tel)}</td><td>${esc(i.grado)}</td><td>${fmtF(i.fecha)}</td><td>${s(i)}</td><td><button class="btn btn-w btn-sm" data-intwa="${i.id}">WhatsApp</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin interesados</td></tr>';
  $('#intCards').innerHTML = rows.map((i) => `<div class="row"><div class="av" style="background:#7a5a1e">${esc(ini(i.nombre))}</div><div class="who"><b>${esc(i.nombre)}</b><span>${esc(i.tel)} · ${esc(i.grado)} · ${fmtF(i.fecha)}</span></div>${s(i)}</div>`).join('');
}

// ================= Circulares =================
const TPL = {
  reunion: ['Reunión de padres', 'Les invitamos a la reunión de padres el próximo miércoles a las 4:00 p. m. en el salón de actos. Se tratarán temas del primer período. Su asistencia es importante.'],
  suspension: ['Suspensión de docencia', 'Les informamos que mañana no habrá docencia por jornada de capacitación del personal. Las clases se reanudan al día siguiente en horario normal.'],
  actividad: ['Feria científica', 'Nuestra feria científica será el viernes de 8:00 a. m. a 12:00 m. Las familias están invitadas a visitar los proyectos de los estudiantes.'],
  notas: ['Entrega de calificaciones', 'La entrega de calificaciones del primer período será el miércoles 2 de diciembre de 2:00 a 5:00 p. m. El padre o tutor debe presentarse con su cédula.'],
};
let cDest = new Set(['Todo']), cWhen = 'now';
function cGrupos() { const g = ['Todo', 'Inicial', 'Primaria', 'Secundaria']; const gr = [...new Set(DB.stus.map((s) => s.grado))].sort((a, b) => GRADOS.findIndex((x) => x[0] === a) - GRADOS.findIndex((x) => x[0] === b)); return g.concat(gr); }
function destinatarios() { const st = DB.stus.filter((s) => cDest.has('Todo') || cDest.has(s.nivel) || cDest.has(s.grado)); return { est: st.length, fams: [...new Set(st.map((s) => s.fam))] }; }
const etiquetaEnvio = () => DB.modoDemo ? ' · modo demo' : '';
function renderCirc() {
  $('#cLocked').classList.toggle('hide', DB.modCirc); $('#cOn').classList.toggle('hide', !DB.modCirc); $('#cState').textContent = DB.modCirc ? 'Módulo activo' + etiquetaEnvio() : 'Módulo desactivado';
  $('#cDest').innerHTML = cGrupos().map((g) => `<button class="chk ${cDest.has(g) ? 'on' : ''}" data-dest="${esc(g)}">${g === 'Todo' ? 'Todo el colegio' : esc(g)}</button>`).join('');
  const d = destinatarios(); const n = d.fams.length;
  $('#cN').textContent = n; $('#cE').textContent = d.est;
  $('#cCost').textContent = usd(n * C_UTIL);
  $('#cCostSub').textContent = `${n} mensajes × US$${C_UTIL} (tarifa de utilidad · República Dominicana). Se envía un solo mensaje por padre aunque tenga varios hijos.` + (DB.modoDemo ? ' En modo demo solo reciben el mensaje los números vinculados.' : '');
  $('#cAlt').innerHTML = `⚠️ Si Meta clasifica la plantilla como <b>marketing</b> (por ejemplo, si incluye promociones), costaría <b>${usd(n * C_MKT)}</b>.<br>Fuera de la ventana de 24 h se necesita una plantilla aprobada por Meta.`;
  const tit = $('#cTit').value || 'Título de la circular', msg = $('#cMsg').value || 'El texto de la circular aparecerá aquí.';
  $('#cPrev').innerHTML = `📢 <b>${esc(tit)}</b>\n\nEstimada familia:\n${esc(msg)}\n\n<span style="color:#667781">${esc(META.colegio)} · Responda MENÚ para más opciones</span><i>${hora()}</i>`;
  $('#cSend').textContent = cWhen === 'now' ? `Enviar a ${n} padres` : `Programar para ${n} padres`;
  $('#cSend').disabled = !n || !$('#cTit').value.trim() || !$('#cMsg').value.trim();
  const tot = DB.circs.reduce((a, c) => a + c.costo, 0);
  $('#cTot').textContent = `${DB.circs.length} circulares · ${usd(tot)} en total`;
  $('#cHist').innerHTML = DB.circs.slice().reverse().map((c) => `<div class="row"><div class="av" style="background:var(--gold)">📢</div><div class="who"><b>${esc(c.tit)}</b><span>${esc(c.dest)} · ${c.n} padres · ${c.prog ? 'programada' : 'enviada'} ${fmtF(c.fecha)}</span></div><span class="amt">${usd(c.costo)}</span></div>`).join('') || '<p class="empty">Sin circulares</p>';
}
function sendCirc(ev) {
  act(ev.currentTarget, async () => {
    const r = await api('/circulares', { tit: $('#cTit').value.trim(), msg: $('#cMsg').value.trim(), dest: [...cDest], prog: cWhen !== 'now' });
    $('#cTit').value = ''; $('#cMsg').value = ''; $('#cTpl').value = '';
    await load();
    toast(cWhen === 'now' ? `Circular para ${r.n} padres · ${r.enviados} enviadas${r.simulados ? ` · ${r.simulados} simuladas` : ''}${r.fallidos ? ` · ${r.fallidos} fallaron` : ''}` : 'Circular programada para mañana');
  });
}

// ================= Recordatorios =================
function plantilla(f, s, tipo) {
  const nom = f.tutor.split(' ')[0];
  if (tipo === 'mora') {
    const meses = [...new Set(s.mesesMora.map((z) => MES_LARGO[z[1]]))].join(', '); const hijos = [...new Set(s.mesesMora.map((z) => z[0].nombre))].join(' y ');
    return `⚠️ Hola, ${nom}. La cuenta de *${hijos}* tiene pendiente la mensualidad de *${meses}*.\nMonto pendiente: *${rd(s.mora)}*\nPuede pagar en la secretaría o por transferencia y enviarnos el comprobante por aquí. Si ya pagó, ignore este mensaje.`;
  }
  const hijos = [...new Set(s.mesesPend.map((z) => z[0].nombre))].join(' y '); const k = s.mesesPend[0][1];
  return `🔔 Hola, ${nom}. Le recordamos que la mensualidad de *${MES_LARGO[k]}* de *${hijos}* vence el *${ddmm(k)}*.\nMonto: *${rd(s.pend)}*\nResponda *MENÚ* para ver su estado de cuenta o enviar su comprobante.`;
}
function cola() {
  if (!DB.modRec) return [];
  return DB.fams.map((f) => ({ f, s: estadoFam(f) })).flatMap(({ f, s }) => {
    if (DB.sent.some((x) => x.fam === f.id && x.hoy)) return [];
    if (s.mora > 0 && DB.rules.mora) return [{ f, s, tipo: 'mora' }];
    if (s.pend > 0 && DB.rules.previo) return [{ f, s, tipo: 'previo' }]; return [];
  });
}
const TICK = { Enviado: ['t-sent', '✓'], Entregado: ['t-sent', '✓✓'], 'Leído': ['t-read', '✓✓'], Simulado: ['t-sent', '◌'], 'Falló': ['t-sent', '⚠️'] };
function renderAvisos() {
  $('#locked').classList.toggle('hide', DB.modRec); $('#modOn').classList.toggle('hide', !DB.modRec);
  $('#modState').textContent = DB.modRec ? 'Módulo activo' + etiquetaEnvio() : 'Módulo desactivado';
  document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', !!DB.rules[b.dataset.rule]));
  const q = cola(); $('#qBadge').textContent = q.length || '';
  $('#qSub').textContent = q.length ? `${q.length} familias con pagos pendientes o vencidos` : 'Todo enviado por hoy';
  $('#sendAll').disabled = !q.length;
  $('#queue').innerHTML = q.length ? q.map((x) => `<div class="qitem"><div class="av" style="background:${colorAv(x.f.id)}">${esc(ini(x.f.tutor))}</div><div class="who"><b>${esc(x.f.tutor)}</b><span>${esc(x.f.tel)} · ${x.tipo === 'mora' ? 'Mora ' + rd(x.s.mora) : 'Aviso previo ' + rd(x.s.pend)}</span></div>${x.tipo === 'mora' ? '<span class="pill p-bad">Mora</span>' : '<span class="pill p-warn">Previo</span>'}<button class="btn btn-o btn-sm" data-prev="${x.f.id}">Ver</button></div>`).join('') : '<p class="empty">No hay recordatorios pendientes ✅</p>';
  const rs = DB.sent.filter((x) => x.rec); const tot = rs.filter((x) => x.est !== 'Simulado').length + q.length;
  $('#costV').textContent = usd(tot * C_UTIL);
  $('#costSub').textContent = `${tot} mensajes × US$${C_UTIL} (tarifa de utilidad, República Dominicana)`;
  $('#sentLog').innerHTML = rs.length ? [...rs].reverse().slice(0, 15).map((x) => `<div class="row"><div class="av" style="background:${x.est === 'Falló' ? 'var(--bad)' : '#25d366'}">${x.est === 'Falló' ? '!' : '✓'}</div><div class="who"><b>${esc(x.tutor)}</b><span>${esc(x.tipo)} · ${x.hora}</span></div><span class="ticks ${(TICK[x.est] || TICK.Enviado)[0]}">${(TICK[x.est] || TICK.Enviado)[1]} ${esc(x.est)}</span></div>`).join('') : '<p class="empty">Aún no se ha enviado nada</p>';
}
function preview(id) {
  const x = cola().find((c) => c.f.id === id); if (!x) return;
  $('#waTitle').textContent = 'Vista previa del recordatorio'; $('#waSub').textContent = `Para ${x.f.tutor} · ${x.f.tel}${x.f.real ? '' : ' · familia de prueba (simulado)'}`;
  $('#waText').innerHTML = fmtWA(plantilla(x.f, x.s, x.tipo)) + `<i>${hora()}</i>`;
  $('#waSend').onclick = (ev) => act(ev.currentTarget, async () => { const r = await api('/recordatorios/enviar', { fam: x.f.id }); closeAll(); toast(resEnvio(r, 'Recordatorio enviado')); await load(); });
  openModal('#mWa');
}

// ================= WhatsApp (conversaciones reales) =================
let CHATS = [], curChat = null, MSGS = [];
async function loadChats() {
  CHATS = await api('/chats');
  const pend = CHATS.filter((c) => c.humano).length; $('#bChat').textContent = pend || '';
  renderChatList();
  if (curChat) await openChat(curChat, true);
}
function renderChatList() {
  $('#chatList').innerHTML = CHATS.length ? CHATS.map((c) => `<div class="row ${c.tel === curChat ? 'on' : ''}" data-chat="${c.tel}"><div class="av" style="background:${c.fam ? colorAv(c.fam) : '#7a5a1e'}">${esc(ini(c.nombre)) || '?'}</div><div class="who"><b>${esc(c.nombre)}</b><span>${c.dir === 'out' ? '↪ ' : ''}${esc(c.texto.split('\n')[0])}</span></div><div style="text-align:right;flex:none"><small style="color:var(--muted)">${horaDe(c.fecha)}</small>${c.humano ? '<div><span class="pill p-warn">Secretaría</span></div>' : c.fam ? '' : '<div><span class="pill p-info">Nuevo</span></div>'}</div></div>`).join('') : '<p class="empty">Aún no hay mensajes. Escribe al número del colegio para probar.</p>';
}
async function openChat(tel, silencioso) {
  curChat = tel;
  const c = CHATS.find((x) => x.tel === tel);
  const msgs = await api('/chats/' + tel);
  const cambio = msgs.length !== MSGS.length || !silencioso;
  MSGS = msgs;
  $('#chName').textContent = c ? c.nombre : tel;
  $('#chSub').textContent = c ? `${c.telBonito} · ${c.abierta ? 'puede responder hasta las ' + horaDe(c.cierra) : 'ventana de 24 h cerrada'}` : '';
  $('#pinTxt').disabled = $('#pinBtn').disabled = !(c && c.abierta);
  $('#pinTxt').placeholder = c && c.abierta ? 'Responder como secretaría' : 'Ventana cerrada: el padre debe escribir primero';
  if (cambio) {
    const st = (e) => !e ? '' : e === 'Leído' ? '<b class="st leido">✓✓</b>' : e === 'Entregado' ? '<b class="st">✓✓</b>' : e === 'Enviado' ? '<b class="st">✓</b>' : e === 'Simulado' ? '<b class="st">◌</b>' : '<b class="st" title="' + esc(e) + '">⚠️</b>';
    $('#chat').innerHTML = msgs.map((m) => `<div class="m ${m.dir === 'out' ? 'me' : 'bot'}">${fmtWA(m.texto).replace(/\[([^\]]+)\]/g, '<span class="pill p-mute" style="margin:2px 2px 0 0">$1</span>')}<i>${horaDe(m.fecha)}${m.dir === 'out' ? st(m.estado) : ''}</i></div>`).join('') || '<p class="empty">Sin mensajes</p>';
    $('#chat').scrollTop = $('#chat').scrollHeight;
  }
  if (!silencioso) renderChatList();
}
function renderDemoForm() {
  $('#waNum').textContent = META.whatsapp.replace(/^1(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  $('#vWa').href = `https://wa.me/${META.whatsapp}?text=Hola`;
  const v = $('#vFam').value;
  $('#vFam').innerHTML = DB.fams.map((f) => { const s = estadoFam(f); return `<option value="${f.id}">${esc(f.tutor)} — ${PILL[s.st][1]}${f.real ? ' · 📱 ' + esc(f.tel) : ''}</option>`; }).join('');
  if (v) $('#vFam').value = v; else { const m = DB.fams.find((f) => estadoFam(f).st === 'bad' && hijosDe(f.id).length > 1) || DB.fams.find((f) => estadoFam(f).st === 'bad'); if (m) $('#vFam').value = m.id; }
  $('#waTag').textContent = !META.waConectado ? 'WhatsApp sin conectar' : DB.modoDemo ? 'Modo demo' : 'En vivo';
}

// ================= UI general =================
function openModal(s) { $('#ov').classList.add('show'); $(s).classList.add('show'); }
function closeAll() { document.querySelectorAll('.modal.show,.drawer.show').forEach((m) => m.classList.remove('show')); $('#ov').classList.remove('show'); }
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3500); }
function renderAll() {
  PAGADOS = new Set(DB.pays.map((p) => p.est + '|' + p.mes));
  $('#uNombre').textContent = DB.user.nombre; $('#mUser').textContent = DB.user.nombre;
  $('#demoNote').textContent = DB.modoDemo ? 'Modo demo: solo se envían mensajes a los números vinculados.' : '';
  $('#demoTag').classList.toggle('hide', !DB.modoDemo);
  $('#reset').classList.toggle('hide', DB.user.rol !== 'director' || !DB.modoDemo);
  renderPanel(); renderFamilias(); renderPagos(); renderComps(); renderSol(); renderInt(); renderCirc(); renderAvisos(); renderDemoForm();
  if (curFam && $('#drawer').classList.contains('show')) openFam(curFam);
}
let vista = 'panel';
function go(v) {
  vista = v;
  document.querySelectorAll('main>section').forEach((s) => s.classList.toggle('hide', s.id !== 'v-' + v));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo(0, 0);
  if (v === 'asistente') loadChats().catch(() => {});
  if (v === 'web') cargarWeb().catch(() => {});
}
document.querySelectorAll('#nav button').forEach((b) => (b.onclick = () => go(b.dataset.v)));
document.addEventListener('click', (e) => {
  const t = e.target;
  const g = t.closest('[data-go]'); if (g) { if (g.dataset.tab) { stab = g.dataset.tab; renderSol(); } else if (g.dataset.go === 'solicitudes' && g.classList.contains('alert')) { stab = 'ausencias'; renderSol(); } go(g.dataset.go); return; }
  const fm = t.closest('[data-fam]'); if (fm) { openFam(fm.dataset.fam); return; }
  if (t.closest('[data-close]') || t.id === 'ov') { closeAll(); return; }
  if (t.closest('[data-pay]')) { openPay(); return; }
  const m = t.closest('[data-m]'); if (m && !m.disabled) { const k = m.dataset.m; sel = sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]; m.classList.toggle('on'); updTot(); return; }
  const pv = t.closest('[data-prev]'); if (pv) { preview(pv.dataset.prev); return; }
  const sw = t.closest('[data-rule]'); if (sw) { const rules = { ...DB.rules, [sw.dataset.rule]: !DB.rules[sw.dataset.rule] }; act(sw, async () => { await api('/config', { rules }); await load(); }); return; }
  const ct = t.closest('[data-ctab]'); if (ct) { ctab = ct.dataset.ctab; document.querySelectorAll('[data-ctab]').forEach((b) => b.classList.toggle('on', b === ct)); renderComps(); return; }
  const cok = t.closest('[data-cok]'); if (cok) { act(cok, async () => { const r = await api(`/comprobantes/${cok.dataset.cok}/aprobar`, {}); await load(); toast(resEnvio(r.envio, `Pago registrado (${r.recibo.id}) y recibo enviado`)); }); return; }
  const crej = t.closest('[data-crej]'); if (crej) { rejId = crej.dataset.crej; openModal('#mRej'); return; }
  const ro = t.closest('#rejOpts .chk'); if (ro) { document.querySelectorAll('#rejOpts .chk').forEach((b) => b.classList.toggle('on', b === ro)); return; }
  const st = t.closest('[data-stab]'); if (st) { stab = st.dataset.stab; renderSol(); return; }
  const au = t.closest('[data-ausok]'); if (au) { act(au, async () => { await api(`/ausencias/${au.dataset.ausok}/visto`, {}); await load(); }); return; }
  const ci = t.closest('[data-citok]'); if (ci) { act(ci, async () => { const r = await api(`/citas/${ci.dataset.citok}/confirmar`, {}); await load(); toast(resEnvio(r.envio, 'Cita confirmada y aviso enviado')); }); return; }
  const hu = t.closest('[data-humok]'); if (hu) { act(hu, async () => { await api(`/humano/${hu.dataset.humok}/ok`, {}); await load(); toast('Conversación marcada como atendida'); }); return; }
  const ch = t.closest('[data-chat]'); if (ch) { if (vista !== 'asistente') go('asistente'); act(null, () => openChat(ch.dataset.chat)); return; }
  const iw = t.closest('[data-intwa]'); if (iw) { const i = DB.ints.find((x) => x.id === iw.dataset.intwa); window.open('https://wa.me/1' + i.tel.replace(/\D/g, '').slice(-10), '_blank', 'noopener'); if (i.estado === 'Nuevo') act(iw, async () => { await api('/interesados/' + i.id, { estado: 'Contactado' }); await load(); }); return; }
  const ds = t.closest('[data-dest]'); if (ds) { const d = ds.dataset.dest; if (d === 'Todo') { cDest = new Set(['Todo']); } else { cDest.delete('Todo'); cDest.has(d) ? cDest.delete(d) : cDest.add(d); if (!cDest.size) cDest.add('Todo'); } renderCirc(); return; }
  const wh = t.closest('[data-when]'); if (wh) { cWhen = wh.dataset.when; document.querySelectorAll('[data-when]').forEach((b) => b.classList.toggle('on', b === wh)); renderCirc(); }
});
document.addEventListener('change', (e) => { const s = e.target.closest('[data-int]'); if (s) act(s, async () => { await api('/interesados/' + s.dataset.int, { estado: s.value }); await load(); }); });
$('#pStu').onchange = fillMonths; $('#pSave').onclick = savePay;
$('#rejOk').onclick = (ev) => { const motivo = [...document.querySelectorAll('#rejOpts .chk')].find((b) => b.classList.contains('on')).textContent; act(ev.currentTarget, async () => { const r = await api(`/comprobantes/${rejId}/rechazar`, { motivo }); closeAll(); await load(); toast(resEnvio(r.envio, 'Comprobante rechazado y padre avisado')); }); };
$('#dPay').onclick = () => { const f = curFam; closeAll(); openPay(f); };
$('#dWa').onclick = () => {
  const f = fam(curFam); const txt = textoEstado(f);
  $('#waTitle').textContent = 'Estado de cuenta por WhatsApp'; $('#waSub').textContent = `Para ${f.tutor} · ${f.tel}${f.real ? '' : ' · familia de prueba (simulado)'}`;
  $('#waText').innerHTML = fmtWA(txt) + `<i>${hora()}</i>`;
  $('#drawer').classList.remove('show');
  $('#waSend').onclick = (ev) => act(ev.currentTarget, async () => { const r = await api('/enviar', { fam: f.id, tipo: 'Estado de cuenta', texto: txt }); closeAll(); toast(resEnvio(r, 'Estado de cuenta enviado')); await load(); });
  openModal('#mWa');
};
$('#sendAll').onclick = (ev) => act(ev.currentTarget, async () => { const r = await api('/recordatorios/enviar', {}); await load(); toast(`${r.total} recordatorios: ${r.enviados} enviados${r.simulados ? ` · ${r.simulados} simulados` : ''}${r.fallidos ? ` · ${r.fallidos} fallaron` : ''}`); });
const setMod = (k, v, msg) => (ev) => act(ev.currentTarget, async () => { await api('/config', { [k]: v }); await load(); toast(msg); });
$('#activate').onclick = setMod('modRec', true, 'Módulo de recordatorios activado');
$('#deactivate').onclick = setMod('modRec', false, 'Módulo de recordatorios desactivado');
$('#cActivate').onclick = setMod('modCirc', true, 'Módulo de circulares activado');
$('#cDeactivate').onclick = setMod('modCirc', false, 'Módulo de circulares desactivado');
$('#cTpl').onchange = () => { const t = TPL[$('#cTpl').value]; if (t) { $('#cTit').value = t[0]; $('#cMsg').value = t[1]; } renderCirc(); };
['#cTit', '#cMsg'].forEach((s) => $(s).addEventListener('input', renderCirc));
$('#cSend').onclick = sendCirc;
['#q', '#fEst', '#fNiv'].forEach((s) => $(s).addEventListener('input', renderFamilias));
['#qp', '#fMet'].forEach((s) => $(s).addEventListener('input', renderPagos));
$('#reset').onclick = (ev) => { if (!confirm('¿Borrar todos los datos y cargar de nuevo los datos de prueba? Las familias vinculadas a números reales se desvinculan.')) return; act(ev.currentTarget, async () => { await api('/demo/reiniciar', {}); curChat = null; MSGS = []; await load(); toast('Datos de prueba cargados de nuevo'); }); };
$('#logout').onclick = $('#mLogout').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); };
$('#pinForm').onsubmit = (e) => { e.preventDefault(); const v = $('#pinTxt').value.trim(); if (!v || !curChat) return; act($('#pinBtn'), async () => { await api('/chats/' + curChat, { texto: v }); $('#pinTxt').value = ''; await loadChats(); await openChat(curChat); }); };
$('#vBtn').onclick = (ev) => act(ev.currentTarget, async () => { await api('/demo/vincular', { fam: $('#vFam').value, tel: $('#vTel').value }); await load(); toast('Número vinculado ✅ Escribe "Hola" al WhatsApp del colegio'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });


// ================= Página web y redes =================
let CONT = null, NUEVAS = [], wtab = 'pubs', tipoPub = 'actividad';
async function cargarWeb() { CONT = await api('/contenido'); renderWeb(); }
// Reduce la foto a JPEG (máx. 1600 px) y, si no cabe en el formato de Instagram (4:5 a 1.91:1), prepara una versión con márgenes
async function procesarFoto(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const cv = (W, H, x, y) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#EEF2F7'; g.fillRect(0, 0, W, H); g.drawImage(img, x, y, w, h); return c.toDataURL('image/jpeg', 0.82).split(',')[1]; };
  const datos = cv(w, h, 0, 0);
  const r = w / h; let ig = null;
  if (r < 0.8) { const W = Math.ceil(h * 0.8); ig = cv(W, h, Math.round((W - w) / 2), 0); }
  else if (r > 1.91) { const H = Math.ceil(w / 1.91); ig = cv(w, H, 0, Math.round((H - h) / 2)); }
  return { datos, ig, ancho: w, alto: h, vista: 'data:image/jpeg;base64,' + datos };
}
const subir = (f) => api('/medios', { datos: f.datos, ig: f.ig, ancho: f.ancho, alto: f.alto });
const ESTADO = { publicado: ['p-ok', 'Publicado'], simulado: ['p-info', 'Simulado'], 'falló': ['p-bad', 'Falló'] };
const chip = (red, e, link) => e ? `<span class="pill ${ESTADO[e]?.[0] || 'p-mute'}">${red}: ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${ESTADO[e]?.[1] || e}</a>` : ESTADO[e]?.[1] || e}</span>` : '';
function renderWeb() {
  if (!CONT) return;
  document.querySelectorAll('[data-wtab]').forEach((b) => b.classList.toggle('on', b.dataset.wtab === wtab));
  $('#wPubs').classList.toggle('hide', wtab !== 'pubs'); $('#wGal').classList.toggle('hide', wtab !== 'gal'); $('#wPortada').classList.toggle('hide', wtab !== 'portada');
  const rd_ = CONT.redes;
  $('#dFbEst').textContent = rd_.fb ? 'Página conectada' : 'Sin conectar: se simula'; $('#dIgEst').textContent = rd_.ig ? 'Cuenta conectada' : 'Sin conectar: se simula';
  $('#pubList').innerHTML = CONT.publicaciones.length ? CONT.publicaciones.map((p) => `<div class="pubrow">${p.fotos[0] ? `<img src="${esc(p.fotos[0])}" alt="">` : '<div class="noimg"></div>'}<div><b>${esc(p.titulo)}</b><span class="meta">${p.tipo === 'noticia' ? 'Noticia' : 'Actividad'} del ${fmtF(p.fecha + 'T12:00:00')} · ${p.fotos.length} foto${p.fotos.length === 1 ? '' : 's'}</span>
    <div class="estados"><span class="pill ${p.web ? 'p-ok' : 'p-mute'}">Web: ${p.web ? 'visible' : 'oculta'}</span>${chip('Facebook', p.fb, p.fbLink)}${chip('Instagram', p.ig, p.igLink)}</div>${p.error ? `<div class="meta" style="color:var(--bad);margin-top:4px">${esc(p.error)}</div>` : ''}</div>
    <div class="acc"><button class="btn btn-o btn-sm" data-pweb="${p.id}" data-v2="${p.web ? 0 : 1}">${p.web ? 'Ocultar de la web' : 'Mostrar en la web'}</button>${p.fb !== 'publicado' ? `<button class="btn btn-o btn-sm" data-pred="${p.id}" data-red="fb">Publicar en Facebook</button>` : ''}${p.ig !== 'publicado' && p.fotos.length ? `<button class="btn btn-o btn-sm" data-pred="${p.id}" data-red="ig">Publicar en Instagram</button>` : ''}<button class="btn btn-r btn-sm" data-pdel="${p.id}">Borrar</button></div></div>`).join('') : '<p class="empty">Aún no hay publicaciones. Crea la primera arriba.</p>';
  $('#galGrid').innerHTML = CONT.galeria.length ? CONT.galeria.map((g) => `<div class="gi ${g.visible ? '' : 'off'}"><img src="${esc(g.foto)}" alt="${esc(g.texto)}" loading="lazy"><div class="gb"><input type="text" value="${esc(g.texto)}" placeholder="Descripción corta" data-gtxt="${g.id}" maxlength="120"><div class="gl"><label><input type="checkbox" data-gvis="${g.id}" ${g.visible ? 'checked' : ''}> Visible en la web</label><button class="btn btn-r btn-sm" data-gdel="${g.id}">Borrar</button></div></div></div>`).join('') : '<p class="empty">La galería está vacía. Sube fotos de clases, actos y celebraciones.</p>';
  $('#bPrev').src = CONT.portada.banner;
  previewPub();
}
function previewPub() {
  const t = $('#pTit').value.trim(), x = $('#pTxt').value.trim();
  $('#pThumbs').innerHTML = NUEVAS.map((f, i) => `<div><img src="${f.vista}" alt=""><button type="button" data-qfoto="${i}" aria-label="Quitar foto">×</button></div>`).join('');
  $('#pFotosN').textContent = NUEVAS.length ? `(${NUEVAS.length} de 10)` : '(hasta 10)';
  const avisos = [];
  if ($('#dIg').checked && !NUEVAS.length) avisos.push('Instagram necesita al menos una foto.');
  if (($('#dFb').checked && !CONT?.redes.fb) || ($('#dIg').checked && !CONT?.redes.ig)) avisos.push('Las redes sin conectar se simulan: no se publica de verdad.');
  $('#pAviso').textContent = avisos.join(' ');
  $('#pPrev').innerHTML = `<div class="ph"><img src="/assets/monograma.png" alt=""><span><b>${esc(META?.colegio || 'Colegio')}</b><small>Ahora</small></span></div><div class="pt">${esc(t || 'Título de la publicación')}${x ? '\n\n' + esc(x) : ''}\n\n#ColegioPauloFreire #LaRomana</div>` +
    (NUEVAS.length ? `<div class="pi">${NUEVAS.slice(0, 2).map((f) => `<img src="${f.vista}" alt="">`).join('')}</div>${NUEVAS.length > 2 ? `<p class="sub" style="padding:8px 12px">+${NUEVAS.length - 2} fotos más</p>` : ''}` : '<div class="vac">Agrega fotos para que se vea mejor</div>');
}
$('#pFecha').value = new Date().toISOString().slice(0, 10);
$('#pFile').onchange = async (e) => {
  const fs = [...e.target.files].slice(0, 10 - NUEVAS.length); e.target.value = '';
  for (const f of fs) { try { NUEVAS.push(await procesarFoto(f)); } catch { toast('No se pudo leer una de las fotos'); } }
  previewPub();
};
['#pTit', '#pTxt'].forEach((s) => $(s).addEventListener('input', previewPub));
['#dFb', '#dIg', '#dWeb'].forEach((s) => $(s).addEventListener('change', previewPub));
$('#pubForm').onsubmit = (e) => {
  e.preventDefault();
  if (!$('#pTit').value.trim()) { toast('Escribe un título'); return; }
  if (!$('#dWeb').checked && !$('#dFb').checked && !$('#dIg').checked) { toast('Elige al menos dónde publicar'); return; }
  if ($('#dIg').checked && !NUEVAS.length) { toast('Instagram necesita al menos una foto'); return; }
  act($('#pPub'), async () => {
    $('#pPub').textContent = NUEVAS.length ? 'Subiendo fotos…' : 'Publicando…';
    const subidas = []; for (const f of NUEVAS) subidas.push(await subir(f));
    $('#pPub').textContent = 'Publicando…';
    const r = await api('/publicaciones', { tipo: tipoPub, titulo: $('#pTit').value, texto: $('#pTxt').value, fecha: $('#pFecha').value, fotos: subidas.map((x) => x.url), fotosIg: subidas.map((x) => x.ig), web: $('#dWeb').checked, fb: $('#dFb').checked, ig: $('#dIg').checked });
    NUEVAS = []; $('#pTit').value = ''; $('#pTxt').value = ''; $('#dFb').checked = $('#dIg').checked = false;
    await cargarWeb();
    const partes = [];
    if (r.redes.fb) partes.push('Facebook: ' + (ESTADO[r.redes.fb.estado]?.[1] || r.redes.fb.estado).toLowerCase());
    if (r.redes.ig) partes.push('Instagram: ' + (ESTADO[r.redes.ig.estado]?.[1] || r.redes.ig.estado).toLowerCase());
    toast('Publicado' + (partes.length ? ' · ' + partes.join(' · ') : '') + (r.redes.error ? ' ⚠️ ' + r.redes.error : ''));
  }).finally(() => { $('#pPub').textContent = 'Publicar'; });
};
$('#gFile').onchange = (e) => {
  const fs = [...e.target.files]; e.target.value = '';
  act(null, async () => { for (const f of fs) { const u = await subir(await procesarFoto(f)); await api('/galeria', { foto: u.url, texto: '' }); } await cargarWeb(); toast(`${fs.length} foto${fs.length === 1 ? '' : 's'} agregada${fs.length === 1 ? '' : 's'} a la galería`); });
};
$('#bFile').onchange = (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  act(null, async () => { const u = await subir(await procesarFoto(f)); await api('/portada', { banner: u.url }); await cargarWeb(); toast('Portada actualizada'); });
};
document.addEventListener('click', (e) => {
  const t = e.target;
  const wt = t.closest('[data-wtab]'); if (wt) { wtab = wt.dataset.wtab; renderWeb(); return; }
  const tp = t.closest('[data-tipo]'); if (tp) { tipoPub = tp.dataset.tipo; document.querySelectorAll('[data-tipo]').forEach((b) => b.classList.toggle('on', b === tp)); return; }
  const qf = t.closest('[data-qfoto]'); if (qf) { NUEVAS.splice(+qf.dataset.qfoto, 1); previewPub(); return; }
  const pw = t.closest('[data-pweb]'); if (pw) { act(pw, async () => { await api('/publicaciones/' + pw.dataset.pweb, { web: pw.dataset.v2 === '1' }); await cargarWeb(); }); return; }
  const pr = t.closest('[data-pred]'); if (pr) { act(pr, async () => { const r = await api(`/publicaciones/${pr.dataset.pred}/redes`, { [pr.dataset.red]: true }); await cargarWeb(); toast(r.error ? '⚠️ ' + r.error : 'Publicado en ' + (pr.dataset.red === 'fb' ? 'Facebook' : 'Instagram')); }); return; }
  const pd = t.closest('[data-pdel]'); if (pd) { if (!confirm('¿Borrar esta publicación de la página? Lo ya publicado en Facebook o Instagram no se borra de allá.')) return; act(pd, async () => { await api(`/publicaciones/${pd.dataset.pdel}/borrar`, {}); await cargarWeb(); toast('Publicación borrada'); }); return; }
  const gd = t.closest('[data-gdel]'); if (gd) { if (!confirm('¿Borrar esta foto de la galería?')) return; act(gd, async () => { await api(`/galeria/${gd.dataset.gdel}/borrar`, {}); await cargarWeb(); }); }
});
document.addEventListener('change', (e) => {
  const gv = e.target.closest('[data-gvis]'); if (gv) act(null, async () => { await api('/galeria/' + gv.dataset.gvis, { visible: gv.checked }); await cargarWeb(); });
  const gt = e.target.closest('[data-gtxt]'); if (gt) act(null, async () => { await api('/galeria/' + gt.dataset.gtxt, { texto: gt.value }); toast('Descripción guardada'); });
});

// ================= Login =================
function quitarCarga() { const c = $('#cargando'); if (c && !c.classList.contains('fuera')) { c.classList.add('fuera'); setTimeout(() => c.remove(), 600); } }
function showLogin() { quitarCarga(); $('#login').classList.remove('hide'); setTimeout(() => $('#lUser').focus(), 50); }
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault(); $('#lErr').textContent = '';
  try {
    await api('/login', { usuario: $('#lUser').value, clave: $('#lPass').value });
    $('#login').classList.add('hide'); $('#lPass').value = '';
    await load(); avisarNuevos();
  } catch (x) { $('#lErr').textContent = x.message; }
};

// ================= Arranque y actualización automática =================
// Avisa cuando llega algo nuevo por WhatsApp (comprobantes, ausencias, citas, etc.)
let vistos = null;
function avisarNuevos() {
  const ids = {
    comp: DB.comps.filter((c) => c.estado === 'pend').map((c) => c.id),
    aus: DB.aus.map((a) => a.id), cit: DB.citas.map((c) => c.id),
    hum: DB.humano.map((h) => h.id), int: DB.ints.map((i) => i.id),
  };
  if (vistos) {
    const nuevos = (k) => ids[k].filter((id) => !vistos[k].has(id));
    const msgs = [];
    nuevos('comp').forEach((id) => { const c = DB.comps.find((x) => x.id === id); msgs.push(`🧾 Nuevo comprobante de ${fam(c.fam)?.tutor || ''}`); });
    nuevos('aus').forEach((id) => { const a = DB.aus.find((x) => x.id === id); msgs.push(`🤒 Ausencia: ${stu(a.est)?.nombre || ''}`); });
    nuevos('cit').forEach(() => msgs.push('📅 Nueva cita por confirmar'));
    nuevos('hum').forEach((id) => { const h = DB.humano.find((x) => x.id === id); msgs.push(`👩‍💼 ${h.nombre} quiere hablar con la secretaría`); });
    nuevos('int').forEach((id) => { const i = DB.ints.find((x) => x.id === id); msgs.push(`🌱 Nuevo interesado: ${i.nombre}`); });
    if (msgs.length) toast(msgs.join(' · '));
  }
  vistos = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, new Set(v)]));
  const pend = ids.comp.length + DB.aus.filter((a) => !a.visto).length + DB.citas.filter((c) => c.estado === 'pend').length + DB.humano.filter((h) => !h.ok).length;
  document.title = (pend ? `(${pend}) ` : '') + 'Sistema administrativo · ' + META.colegio;
}
let cargando = false;
async function refrescar() {
  if (cargando || !DB || document.querySelector('.modal.show')) return;
  cargando = true;
  try { await load(); avisarNuevos(); if (vista === 'asistente') await loadChats(); } catch { /* sin conexión: se reintenta */ }
  finally { cargando = false; }
}
load().then(() => { avisarNuevos(); quitarCarga(); }).catch(() => quitarCarga());
setInterval(() => { if (!document.hidden) refrescar(); }, 5000);
// Al volver a la pestaña o a la ventana, actualizar de inmediato
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
window.addEventListener('focus', refrescar);
