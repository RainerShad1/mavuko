import Link from "next/link";
import type { ReactNode } from "react";
import { MavukoLogo, MavukoSimbolo } from "@/brand/MavukoMarca";
import { Estado, MarcaEjemplo } from "./Base";
import { IconoCheck, IconoExterno, IconoFlecha } from "./Iconos";
import { SimboloCrece, Surge } from "./Surge";

/** Título grande de sección con su entrada a la derecha, sobre la retícula 11 + 5. */
export function Cabecera({ titulo, entrada, nivel = 2 }: { titulo: ReactNode; entrada?: ReactNode; nivel?: 1 | 2 }) {
  const Titulo = nivel === 1 ? "h1" : "h2";
  return (
    <div className="mv-cabecera">
      <Surge as={Titulo}>{titulo}</Surge>
      {entrada && <Surge as="p">{entrada}</Surge>}
    </div>
  );
}

/** Captura del producto en su marco. Sin `src` muestra el espacio previsto con lo que falta. */
export function MarcoCaptura({
  tipo = "escritorio",
  src,
  alt = "",
  pendiente = "Captura pendiente",
  detalle,
  ejemplo = false,
}: {
  tipo?: "escritorio" | "telefono";
  src?: string;
  alt?: string;
  pendiente?: string;
  detalle?: string;
  ejemplo?: boolean;
}) {
  return (
    <figure className="mv-captura" data-tipo={tipo}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- la página decide el formato y el tamaño final
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <div className="mv-captura-vacia">
          <b>{pendiente}</b>
          {detalle}
        </div>
      )}
      {ejemplo && <MarcaEjemplo />}
    </figure>
  );
}

/** Función explicada con su captura. El texto ocupa 5 columnas y la imagen 11, sobre la misma base. */
export function SeccionFuncion({
  titulo,
  texto,
  puntos,
  media,
  lado = "izquierda",
  nivel = 2,
}: {
  titulo: ReactNode;
  texto: ReactNode;
  puntos?: string[];
  media: ReactNode;
  lado?: "izquierda" | "derecha";
  nivel?: 2 | 3;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <div className="mv-funcion" data-lado={lado}>
      <div>
        <Surge as={Titulo}>{titulo}</Surge>
        <p>{texto}</p>
        {puntos && (
          <ul className="mv-puntos">
            {puntos.map((p) => (
              <li key={p}>
                <IconoCheck />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mv-funcion-media">{media}</div>
    </div>
  );
}

/** Escritorio y teléfono juntos, apoyados en la misma base. */
export function ParDeCapturas({ escritorio, telefono }: { escritorio: ReactNode; telefono: ReactNode }) {
  return (
    <div className="mv-capturas">
      {telefono}
      {escritorio}
    </div>
  );
}

/** Tarjeta de sistema: tope cortado a machete, nombre, descripción, estado y enlace. */
export function TarjetaSistema({
  nombre,
  descripcion,
  estado,
  accion,
  href,
  tono = "bruma",
}: {
  nombre: [string, string?];
  descripcion: string;
  estado?: "publicada" | "disponible" | "construccion" | "pronto";
  accion?: string;
  href?: string;
  tono?: "bruma" | "melaza" | "nudo" | "hoja";
}) {
  const contenido = (
    <>
      {estado && <Estado tipo={estado} />}
      <h3>
        <span>{nombre[0]}</span>
        {nombre[1] && <span>{nombre[1]}</span>}
      </h3>
      <p>{descripcion}</p>
      {accion && (
        <span className="mv-enlace">
          {accion}
          <IconoFlecha />
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="mv-sistema" data-tono={tono}>
      {contenido}
    </Link>
  ) : (
    <div className="mv-sistema" data-tono={tono}>
      {contenido}
    </div>
  );
}

/** Tarjetas que suben por la serie desde una base común. */
export function Surco({ children, n }: { children: ReactNode[]; n: 3 | 4 }) {
  return (
    <ul className="mv-surco" data-n={n}>
      {children.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

/** Tarjeta de página web hecha por Mavuko: captura, nombre, tipo y enlace a la página real. */
export function TarjetaPagina({
  nombre,
  tipo,
  href,
  captura,
  alt,
  pendiente = "Captura pendiente",
  ejemplo = false,
  relacion = "16 / 10",
}: {
  nombre: string;
  tipo: string;
  href?: string;
  captura?: string;
  alt?: string;
  pendiente?: string;
  ejemplo?: boolean;
  relacion?: string;
}) {
  const contenido = (
    <>
      <div style={{ aspectRatio: relacion, overflow: "hidden" }}>
        <div style={{ height: "100%" }} className="[&>figure]:h-full [&>figure]:aspect-auto">
          <MarcoCaptura src={captura} alt={alt ?? `Página de ${nombre}`} pendiente={pendiente} ejemplo={ejemplo} />
        </div>
      </div>
      <div className="mv-pagina-texto">
        <h3>{nombre}</h3>
        <p>{tipo}</p>
        {href && (
          <span className="mv-enlace">
            Ver página
            <IconoExterno />
          </span>
        )}
      </div>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="mv-pagina">
      {contenido}
      <span className="mv-oculto">(abre otra pestaña)</span>
    </a>
  ) : (
    <div className="mv-pagina">{contenido}</div>
  );
}

export function GrupoPaginas({ children }: { children: ReactNode[] }) {
  return (
    <ul className="mv-paginas">
      {children.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

/** Cinta de nombres. Es adorno y repite contenido que ya está en la página: lectores de pantalla la omiten. */
export function Cinta({ textos, tema = "cana" }: { textos: string[]; tema?: "cana" | "melaza" | "suave" }) {
  const fila = (
    <ul>
      {textos.map((t) => (
        <li key={t}>
          {t}
          <MavukoSimbolo variante={tema === "melaza" ? "oscuro" : tema === "cana" ? "melaza" : "color"} aria-hidden="true" role="presentation" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mv-cinta" data-tema={tema} aria-hidden="true">
      <div>
        {fila}
        {fila}
      </div>
    </div>
  );
}

/** Cierre de página: una pregunta, una acción y el símbolo que crece. */
export function LlamadaAccion({ titulo, texto, accion }: { titulo: ReactNode; texto?: ReactNode; accion: ReactNode }) {
  return (
    <div className="mv-llamada">
      <div>
        <Surge as="h2">{titulo}</Surge>
        {texto && <p>{texto}</p>}
        {accion}
      </div>
      <SimboloCrece />
    </div>
  );
}

export function Pie({
  enlaces,
  nota,
  tema = "melaza",
}: {
  enlaces: { texto: string; href: string; externo?: boolean }[];
  nota: ReactNode;
  tema?: "melaza" | "base" | "suave";
}) {
  return (
    <footer className="mv-pie" data-tema={tema}>
      <div className="mv-pie-fila">
        <Link href="/" className="mv-pie-logo" aria-label="Mavuko, soluciones tecnológicas. Inicio">
          <MavukoLogo className="c" variante="color" conLema aria-hidden="true" />
          <MavukoLogo className="o" variante="oscuro" conLema aria-hidden="true" />
        </Link>
        <ul>
          {enlaces.map((e) => (
            <li key={e.texto}>
              <Link href={e.href} {...(e.externo ? { target: "_blank", rel: "noreferrer" } : {})}>
                {e.texto}
              </Link>
            </li>
          ))}
        </ul>
        <small>{nota}</small>
      </div>
    </footer>
  );
}

/** Firma para las apps con marca blanca de cada restaurante. Es lo único de Mavuko que aparece ahí. */
export function HechoPorMavuko({ href = "/" }: { href?: string }) {
  return (
    <a className="mv-hecho" href={href}>
      Hecho por
      <i>
        <MavukoSimbolo className="c" variante="color" aria-hidden="true" />
        <MavukoSimbolo className="o" variante="oscuro" aria-hidden="true" />
      </i>
      Mavuko
    </a>
  );
}
