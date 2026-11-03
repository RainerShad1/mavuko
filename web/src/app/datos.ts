import type { EnlaceNav } from "@/sistema";

export const WHATSAPP = "https://wa.me/18097527776";

export const ENLACES: EnlaceNav[] = [
  { texto: "Qué hacemos", href: "#que-hacemos" },
  { texto: "Cómo trabajamos", href: "#como-trabajamos" },
  { texto: "Restaurantes", href: "#restaurantes" },
  { texto: "Páginas web", href: "#paginas" },
];

export const ENLACES_PIE = [...ENLACES, { texto: "WhatsApp", href: WHATSAPP, externo: true }];
export const NOTA_PIE = "Mavuko Solutions";

export const ADAPTACION = [
  { titulo: "Tu imagen", texto: "Tu logo y tus colores. Tus clientes ven tu negocio, no el nuestro." },
  { titulo: "Funciones por módulos", texto: "Usas lo que necesitas hoy y sumas lo demás cuando haga falta." },
  { titulo: "Módulos a la medida", texto: "Si tu negocio trabaja distinto, creamos la pieza que falta." },
  { titulo: "Automatizaciones", texto: "Lo que hoy se repite a mano, como avisos, pedidos o cuentas, lo hace el sistema." },
];

export const PASOS = [
  { nombre: "Instalamos", texto: "Dejamos el sistema funcionando en tu negocio y le enseñamos a tu equipo a usarlo.", tono: "bruma" },
  { nombre: "Adaptamos", texto: "Lo ajustamos a cómo trabajas: tu imagen, tus funciones y lo que haga falta crear.", tono: "nudo" },
  { nombre: "Mantenemos", texto: "Por una mensualidad lo mantenemos al día y te ayudamos cuando algo falle.", tono: "melaza" },
] as const;

// Para sumar una página creada por Mavuko, añádela aquí con su captura en public/paginas/.
export const PAGINAS = [
  {
    nombre: "Romana CompuService",
    tipo: "Tienda en línea de computadoras, repuestos y servicio técnico, con pedidos y seguimiento en vivo.",
    href: "https://romanacompuservice-tienda.vercel.app/",
    captura: "/paginas/romana-compuservice.webp",
    alt: "Portada de la tienda en línea de Romana CompuService",
  },
  {
    nombre: "Mayelin Empanadas",
    tipo: "Pedidos a domicilio con mapa, panel del negocio y avisos automáticos por WhatsApp en cada paso del pedido.",
    href: "https://mayelin-empanadas.vercel.app/",
    captura: "/paginas/mayelin-empanadas.webp",
    alt: "Portada de la página de pedidos de Mayelin Empanadas",
  },
];
