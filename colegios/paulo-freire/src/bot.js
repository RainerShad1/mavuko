// Asistente de WhatsApp: recibe cada mensaje de un padre (o de un número nuevo) y responde.
import { COLEGIO, FAQ, FAQR } from './colegio.js';
import { meses, mesLargo, venceDe, hoyRD, rd, cap, ahoraRD } from './cobros.js';
import { enviar, registrarMensaje, descargarMedia, marcarLeido } from './wa.js';
import { nuevoId, telWA, telBonito } from './db.js';
import { estadoDeFamilia, primerNombre } from './avisos.js';

const SALUDO = /^(hola|buen[oa]s?|menu|menú|inicio|saludos|hey|ola|q tal|que tal|saludo)/i;
const VOLVER = [['menu', '↩️ Menú']];

// ---------- sesión de la conversación ----------
async function leerSesion(db, tel) {
  const s = await db.one('select paso, ctx, actualizado from wa_sesiones where tel = $1', [tel]);
  if (!s) return { paso: 'menu', ctx: {} };
  // la conversación con la secretaría se cierra sola después de 3 horas
  if (s.paso === 'humano' && Date.now() - new Date(s.actualizado).getTime() > 3 * 3600e3) return { paso: 'menu', ctx: {} };
  return { paso: s.paso, ctx: s.ctx || {} };
}
async function guardarSesion(db, tel, paso, ctx = {}) {
  await db.q(
    `insert into wa_sesiones(tel, paso, ctx, actualizado) values($1,$2,$3::jsonb, now())
     on conflict (tel) do update set paso = excluded.paso, ctx = excluded.ctx, actualizado = now()`,
    [tel, paso, JSON.stringify(ctx)]
  );
}

// ---------- entrada desde el webhook ----------
export async function procesarMensaje(env, db, m, perfil) {
  const tel = telWA(m.from);
  let texto = '', accion = null, media = null;
  if (m.type === 'text') texto = m.text.body.trim();
  else if (m.type === 'interactive') {
    const r = m.interactive.button_reply || m.interactive.list_reply;
    accion = r.id; texto = r.title;
  } else if (m.type === 'button') { texto = m.button.text; accion = m.button.payload || null; }
  else if (m.type === 'image') { media = { id: m.image.id, mime: m.image.mime_type }; texto = m.image.caption || ''; }
  else if (m.type === 'document') { media = { id: m.document.id, mime: m.document.mime_type }; texto = m.document.caption || m.document.filename || ''; }
  else texto = `[${m.type}]`;

  await registrarMensaje(db, tel, 'in', m.type, media ? `📎 ${m.type === 'image' ? 'Foto' : 'Documento'}${texto ? ': ' + texto : ''}` : texto, m.id);
  await marcarLeido(env, m.id);

  const fam = await db.one('select * from familias where tel_wa = $1', [tel]);
  const ses = await leerSesion(db, tel);
  const b = new Bot(env, db, tel, fam, ses, perfil);
  try {
    if (fam) await b.padre(texto, accion, media);
    else await b.nuevo(texto, accion, media);
  } finally {
    await guardarSesion(db, tel, b.ses.paso, b.ses.ctx);
  }
}

class Bot {
  constructor(env, db, tel, fam, ses, perfil) {
    Object.assign(this, { env, db, tel, fam, ses, perfil });
  }
  say(texto, opciones, boton) { return enviar(this.env, this.db, this.tel, texto, opciones, boton); }
  paso(p, ctx = {}) { this.ses = { paso: p, ctx }; }

  // ======== Padres registrados ========
  async padre(texto, accion, media) {
    const l = texto.toLowerCase();
    if (media) return this.recibirComprobante(media);
    if (this.ses.paso === 'humano' && !accion && !SALUDO.test(l)) return; // la secretaría está atendiendo
    if (accion) return this.accion(accion);
    if (SALUDO.test(l)) return this.menu(true);
    if (/(estado|debo|deuda|balance|cuánto|cuanto)/.test(l)) return this.estadoCuenta();
    if (/(no va|no irá|no ira|enferm|ausen|falt)/.test(l)) return this.elegirHijo('aus');
    if (/(comprobante|transfer[ií]|recibo|ya pagu|ya pag[oó])/.test(l)) {
      const pc = await this.compPendiente();
      if (pc) return this.say(`🧾 Su comprobante de *${rd(pc.monto)}* sigue en revisión. La secretaría lo valida en horario de oficina y le enviaremos el recibo por aquí. 🙏`, VOLVER);
      return this.elegirHijo('comp');
    }
    if (/(cita|reuni[oó]n con|hablar con (la )?direc)/.test(l)) return this.cita();
    for (const k in FAQ) if (FAQ[k].some((w) => l.includes(w))) return this.faq(k);
    if (/(secretar|persona|humano|alguien)/.test(l)) return this.humano(texto);
    await this.say('🤔 No tengo esa información todavía. Le paso su mensaje a la secretaría para que le respondan.');
    return this.humano(texto, true);
  }

  async accion(a) {
    const i = a.indexOf(':');
    const cmd = i < 0 ? a : a.slice(0, i);
    const resto = i < 0 ? '' : a.slice(i + 1);
    let x = resto, y = '';
    if (cmd === 'hijo' || cmd === 'mot') { const j = resto.indexOf(':'); x = resto.slice(0, j); y = resto.slice(j + 1); }
    const soloPadres = ['menu', 'estado', 'comp', 'aus', 'cita', 'info', 'hijo', 'mot', 'con', 'dia', 'hora'];
    if (!this.fam && soloPadres.includes(cmd)) return this.bienvenidaNuevo();
    switch (cmd) {
      case 'menu': return this.menu();
      case 'estado': return this.estadoCuenta();
      case 'comp': return this.elegirHijo('comp');
      case 'aus': return this.elegirHijo('aus');
      case 'cita': return this.cita();
      case 'info': return this.info();
      case 'faq': return this.faq(x);
      case 'hum': return this.humano();
      case 'hijo': return this.conHijo(x, y);
      case 'mot': return this.registrarAusencia(x, y);
      case 'con': return this.citaDia(x);
      case 'dia': return this.citaHora(x);
      case 'hora': return this.registrarCita(x);
      case 'ins': return this.interesado();
      case 'niv': return this.guardarInteresado(x);
      case 'inicio': return this.fam ? this.menu() : this.bienvenidaNuevo();
      default: return this.fam ? this.menu() : this.bienvenidaNuevo();
    }
  }

  async compPendiente() {
    return this.db.one("select * from comprobantes where familia_id = $1 and estado = 'pend' order by fecha desc limit 1", [this.fam.id]);
  }

  async menu(saludo) {
    this.paso('menu');
    const pc = await this.compPendiente();
    const t = (saludo ? `¡Hola, ${primerNombre(this.fam.tutor)}! 👋 Soy el asistente virtual del *${COLEGIO.nombre}*.\n` : '') +
      (pc ? `🧾 Su comprobante de *${rd(pc.monto)}* está en revisión. Le enviaremos el recibo por aquí en cuanto la secretaría lo valide.\n\n` : '') +
      '¿En qué le puedo ayudar?';
    return this.say(t, [
      ['estado', '💳 Estado de cuenta', 'Mensualidades pagadas y pendientes'],
      ['comp', '🧾 Enviar comprobante', 'Foto de su transferencia'],
      ['aus', '🤒 Reportar ausencia', 'Avisar que no asistirá hoy'],
      ['cita', '📅 Agendar cita', 'Dirección, orientación o docente'],
      ['info', 'ℹ️ Información', 'Horario, uniforme, calendario…'],
      ['hum', '👩‍💼 Secretaría', 'Hablar con una persona'],
    ], 'Ver opciones');
  }

  async estadoCuenta() {
    const s = await estadoDeFamilia(this.db, this.fam.id);
    const hoy = hoyRD();
    const visibles = meses().filter(({ k }) => venceDe(k) <= hoy || s.mesesPend.some((z) => z[1] === k));
    const cuerpo = s.hijos.map((h) => `\n*${h.nombre} · ${h.grado}*\n` + visibles.map(({ k }) => {
      const p = s.pagados.has(h.id + '|' + k);
      const venc = venceDe(k) < hoy;
      return `${p ? '✅' : venc ? '❌' : '⏳'} ${cap(mesLargo(k))} — ${p ? 'Pagado' : venc ? 'Pendiente' : 'Vence ' + venceDe(k).slice(8) + '/' + k.slice(5)}`;
    }).join('\n')).join('\n');
    const pie = `\n\n${s.mora ? 'Total vencido: *' + rd(s.mora) + '*\n' : ''}${s.pend ? 'Por vencer: *' + rd(s.pend) + '*' : ''}${!s.mora && !s.pend ? '¡Está al día! 🙌' : ''}`;
    return this.say('📄 *Estado de cuenta*\n' + cuerpo + pie,
      s.mora || s.pend ? [['comp', '🧾 Comprobante'], ['faq:pagar', '💳 Cómo pagar'], ['menu', '↩️ Menú']] : VOLVER);
  }

  async elegirHijo(para) {
    const hs = await this.db.q('select * from estudiantes where familia_id = $1 order by id', [this.fam.id]);
    if (hs.length === 1) return this.conHijo(para, hs[0].id);
    return this.say('¿Para cuál estudiante?', hs.slice(0, 10).map((h) => [`hijo:${para}:${h.id}`, `${primerNombre(h.nombre)} (${h.grado})`]));
  }

  async conHijo(para, estId) {
    const h = await this.db.one('select * from estudiantes where id = $1 and familia_id = $2', [estId, this.fam.id]);
    if (!h) return this.menu();
    if (para === 'comp') {
      this.paso('esperando_comp', { est: h.id });
      return this.say(`Perfecto. Envíe la *foto o captura* del comprobante de transferencia de ${primerNombre(h.nombre)} 📎\n\nCuentas del colegio:\n${COLEGIO.cuentas}`, VOLVER);
    }
    if (para === 'compfoto') return this.crearComprobante(h, this.ses.ctx.media);
    if (para === 'aus') {
      return this.say(`¿Cuál es el motivo de la ausencia de ${primerNombre(h.nombre)} hoy?`,
        ['Enfermedad', 'Cita médica', 'Viaje familiar', 'Otro motivo'].map((m) => [`mot:${h.id}:${m}`, m]), 'Elegir motivo');
    }
    return this.menu();
  }

  async recibirComprobante(media) {
    const hs = await this.db.q('select * from estudiantes where familia_id = $1 order by id', [this.fam.id]);
    let h = this.ses.paso === 'esperando_comp' ? hs.find((x) => x.id === this.ses.ctx.est) : null;
    if (!h && hs.length === 1) h = hs[0];
    if (!h) {
      this.paso('comp_hijo', { media });
      return this.say('📎 Recibimos su archivo. ¿De cuál estudiante es este comprobante?', hs.slice(0, 10).map((x) => [`hijo:compfoto:${x.id}`, `${primerNombre(x.nombre)} (${x.grado})`]));
    }
    return this.crearComprobante(h, media);
  }

  async crearComprobante(h, media) {
    if (!media) return this.menu();
    const s = await estadoDeFamilia(this.db, this.fam.id);
    let ms = [...s.mesesMora, ...s.mesesPend].filter((z) => z[0].id === h.id).map((z) => z[1]);
    if (!ms.length) { const n = meses().find(({ k }) => !s.pagados.has(h.id + '|' + k)); ms = n ? [n.k] : []; }
    if (!ms.length) { this.paso('menu'); return this.say(`🙌 ${primerNombre(h.nombre)} ya tiene todo el año escolar pagado. Si es un pago distinto, escriba *secretaría*.`, VOLVER); }
    const monto = ms.length * COLEGIO.tarifas[h.nivel];
    const arch = await descargarMedia(this.env, media.id).catch(() => null);
    const id = await nuevoId(this.db, 'C');
    await this.db.q(
      'insert into comprobantes(id, familia_id, estudiante_id, meses, monto, mime, imagen) values($1,$2,$3,$4,$5,$6,$7)',
      [id, this.fam.id, h.id, ms, monto, arch?.mime || media.mime || null, arch?.b64 || null]
    );
    this.paso('menu');
    return this.say(`✅ Recibimos su comprobante.\nCorresponde a: ${ms.map(mesLargo).join(', ')} de ${h.nombre} (*${rd(monto)}*).\n\nLa secretaría lo validará y le enviaremos su recibo por aquí. ⏳`, VOLVER);
  }

  async registrarAusencia(estId, motivo) {
    const h = await this.db.one('select * from estudiantes where id = $1 and familia_id = $2', [estId, this.fam.id]);
    if (!h) return this.menu();
    const id = await nuevoId(this.db, 'A');
    await this.db.q('insert into ausencias(id, estudiante_id, familia_id, motivo) values($1,$2,$3,$4)', [id, h.id, this.fam.id, motivo]);
    return this.say(`📝 Listo. Registramos la ausencia de *${h.nombre}* para hoy (${motivo.toLowerCase()}).\nYa le avisamos a la secretaría. ${motivo === 'Enfermedad' ? '¡Que se mejore pronto! 🙏' : ''}`, VOLVER);
  }

  cita() {
    return this.say('¿Con quién desea la cita?', ['Dirección', 'Orientación', 'Secretaría', 'Docente'].map((c) => [`con:${c}`, c]), 'Elegir');
  }
  citaDia(con) {
    this.paso('cita', { con });
    const dias = [], DS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    let d = ahoraRD();
    while (dias.length < 3) {
      d = new Date(d.getTime() + 864e5);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      dias.push(`${DS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`);
    }
    return this.say('Elija el día:', dias.map((x) => [`dia:${x}`, x]));
  }
  citaHora(dia) {
    this.paso('cita', { ...this.ses.ctx, dia });
    return this.say('¿A qué hora?', ['8:30 a. m.', '10:00 a. m.', '2:00 p. m.'].map((h) => [`hora:${h}`, h]));
  }
  async registrarCita(hora) {
    const { con, dia } = this.ses.ctx;
    if (!con || !dia) return this.cita();
    const id = await nuevoId(this.db, 'T');
    await this.db.q('insert into citas(id, familia_id, con, dia, hora) values($1,$2,$3,$4,$5)', [id, this.fam.id, con, dia, hora]);
    this.paso('menu');
    return this.say(`📅 Solicitud enviada:\n*${con}* · ${dia} · ${hora}\n\nLe confirmaremos por aquí en cuanto la ${con === 'Dirección' ? 'dirección' : 'secretaría'} la apruebe.`, VOLVER);
  }

  info() {
    return this.say('¿Qué información necesita?', [
      ['faq:horario', '🕗 Horario'], ['faq:uniforme', '👕 Uniforme'], ['faq:calendario', '📅 Calendario'],
      ['faq:ubicacion', '📍 Ubicación'], ['faq:pagar', '💳 Cómo pagar'], ['faq:utiles', '📚 Útiles'],
    ], 'Ver temas');
  }
  faq(k) {
    if (!FAQR[k]) return this.fam ? this.menu() : this.bienvenidaNuevo();
    if (!this.fam && k === 'inscripcion') return this.interesado();
    return this.say(FAQR[k], this.fam ? VOLVER : [['ins', '📝 Quiero inscribir'], ['inicio', '↩️ Inicio']]);
  }

  async humano(texto, silencioso) {
    const id = await nuevoId(this.db, 'H');
    const nombre = this.fam ? this.fam.tutor : (this.ses.ctx.nombre || this.perfil || telBonito(this.tel));
    await this.db.q('insert into humano(id, familia_id, nombre, tel, texto) values($1,$2,$3,$4,$5)', [id, this.fam?.id || null, nombre, this.tel, texto || 'Solicitó hablar con la secretaría']);
    this.paso('humano', this.ses.ctx);
    if (!silencioso) return this.say('👩‍💼 Le comunico con la secretaría. Una persona le responderá por este mismo chat en horario de oficina (7:30 a. m. – 3:00 p. m.).\n\nPara volver al asistente, escriba *menú*.');
  }

  // ======== Números no registrados (futuras familias) ========
  async nuevo(texto, accion, media) {
    const l = texto.toLowerCase();
    if (this.ses.paso === 'humano' && !accion && !SALUDO.test(l)) return;
    if (accion) return this.accion(accion);
    if (this.ses.paso === 'nombre' && texto && !media) {
      const nombre = texto.replace(/^(me llamo|soy|mi nombre es)\s*/i, '').slice(0, 60);
      this.paso('nivel', { nombre });
      return this.say(`Mucho gusto, ${primerNombre(nombre)} 😊 ¿Para qué nivel busca cupo?`, ['Inicial', 'Primaria', 'Secundaria'].map((n) => [`niv:${n}`, n]));
    }
    if (SALUDO.test(l) || !texto) return this.bienvenidaNuevo();
    for (const k in FAQ) if (FAQ[k].some((w) => l.includes(w))) return this.faq(k);
    return this.bienvenidaNuevo();
  }
  bienvenidaNuevo() {
    this.paso('menu');
    return this.say(`¡Hola! 👋 Gracias por escribir al *${COLEGIO.nombre}*.\nSoy el asistente virtual. ¿En qué le puedo ayudar?`, [
      ['ins', '📝 Inscripciones', 'Requisitos y cupos'],
      ['faq:horario', '🕗 Horario'],
      ['faq:ubicacion', '📍 Ubicación'],
      ['hum', '👩‍💼 Hablar con alguien', 'Le atiende la secretaría'],
    ], 'Ver opciones');
  }
  interesado() {
    this.paso('nombre');
    return this.say(FAQR.inscripcion + '\n\nPara que la secretaría le contacte, ¿cuál es su *nombre*?');
  }
  async guardarInteresado(nivel) {
    const nombre = this.ses.ctx.nombre || this.perfil || 'Sin nombre';
    const id = await nuevoId(this.db, 'I');
    await this.db.q('insert into interesados(id, nombre, tel, grado) values($1,$2,$3,$4)', [id, nombre, telBonito(this.tel), nivel]);
    this.paso('menu');
    return this.say(`✅ ¡Gracias, ${primerNombre(nombre)}! Guardamos sus datos.\nLa secretaría le contactará para coordinar una *visita al colegio*.`, [['faq:horario', '🕗 Horario'], ['faq:ubicacion', '📍 Ubicación']]);
  }
}
