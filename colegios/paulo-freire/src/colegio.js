// Datos propios del colegio. Para instalar el sistema en otro colegio,
// se cambia este archivo (y el logo en public/assets).

export const COLEGIO = {
  nombre: 'Colegio Paulo Freire',
  nombreLargo: 'Instituto Dominicano Paulo Freire',
  whatsapp: '18298531204',
  telefono: '829-853-1204',
  telefonoOficina: '809-813-1059',
  direccion: 'Dr. Teófilo Ferry #35, Ens. María Rubio, La Romana',
  ubicacion: 'https://www.google.com/maps/place/Colegio+Instituto+Dominicano+Paulo+Freire/@18.4322493,-68.9674235,19z',
  zonaHoraria: -4, // República Dominicana (UTC-4, sin horario de verano)
  diaVence: 15,
  inicioAno: '2026-08',
  mesesAno: 11, // agosto a junio
  tarifas: { Inicial: 4500, Primaria: 5200, Secundaria: 5900 },
  grados: [
    ['Pre-primario', 'Inicial'],
    ['1.º Primaria', 'Primaria'], ['2.º Primaria', 'Primaria'], ['3.º Primaria', 'Primaria'],
    ['4.º Primaria', 'Primaria'], ['5.º Primaria', 'Primaria'], ['6.º Primaria', 'Primaria'],
    ['1.º Secundaria', 'Secundaria'], ['2.º Secundaria', 'Secundaria'], ['3.º Secundaria', 'Secundaria'],
    ['4.º Secundaria', 'Secundaria'], ['5.º Secundaria', 'Secundaria'], ['6.º Secundaria', 'Secundaria'],
  ],
  cuentas: '• Banreservas · Cta. 000-000000-0\n• Banco Popular · Cta. 000000000',
  costoUtil: 0.0113,
  costoMkt: 0.074,
};

export const FAQR = {
  horario: '🕗 *Horario*\nInicial: 7:30 a. m. – 12:00 m.\nPrimaria y Secundaria: 7:30 a. m. – 1:30 p. m.\nSecretaría: lunes a viernes, 7:30 a. m. – 3:00 p. m.',
  utiles: '📚 La lista de útiles de cada grado está disponible en la secretaría y en nuestra página web.',
  uniforme: '👕 *Uniforme*\nPolo rojo con el logo del colegio y pantalón o falda azul marino. Para más detalles, consulte en la secretaría.',
  ubicacion: `📍 *Ubicación*\n${COLEGIO.direccion}\n${COLEGIO.ubicacion}\n\nTeléfono: ${COLEGIO.telefonoOficina}\nHorario de oficina: 7:30 a. m. – 3:00 p. m.`,
  calendario: '📅 *Próximas fechas*\n• 2/12 Reunión de padres y entrega de calificaciones\n• 12/12 Acto navideño\n• 18/12 Inicio de vacaciones de Navidad\n• 8/1 Regreso a clases',
  pagar: `💳 *Formas de pago*\n• En efectivo o tarjeta en la secretaría\n• Por transferencia:\n${COLEGIO.cuentas}\n\nSi transfiere, envíenos la foto del comprobante por aquí y le llega su recibo.`,
  inscripcion: '📝 *Inscripciones abiertas*\nOfrecemos Nivel Inicial, Primario y Secundario.\nRequisitos: acta de nacimiento, récord de notas, 2 fotos 2x2 y certificado médico.',
};

export const FAQ = {
  horario: ['horario', 'hora', 'entrada', 'salida', 'salen', 'entran'],
  utiles: ['útiles', 'utiles', 'lista', 'libros'],
  uniforme: ['uniforme', 'ropa', 'zapato'],
  ubicacion: ['dónde', 'donde', 'ubicación', 'ubicacion', 'dirección', 'direccion', 'queda', 'mapa'],
  calendario: ['calendario', 'vacaciones', 'feriado', 'fechas', 'navidad'],
  pagar: ['pagar', 'pago', 'cuenta', 'transferencia', 'banco', 'mensualidad'],
  inscripcion: ['inscrib', 'inscripción', 'inscripcion', 'cupo', 'admisi', 'requisito'],
};
