import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { IconoExterno, IconoFlecha } from "./Iconos";

type Comun = {
  variante?: "principal" | "borde";
  tamano?: "normal" | "chico";
  flecha?: boolean;
  cargando?: boolean;
  children: ReactNode;
  className?: string;
};
type ComoEnlace = Comun & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "children" | "className">;
type ComoBoton = Comun & { href?: undefined } & Omit<ComponentProps<"button">, "children" | "className">;

function Carga() {
  return (
    <span className="mv-carga" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Acción. Toma sus colores del tema donde esté: Nudo sobre claro, Sol sobre oscuro. */
export function Boton({ variante = "principal", tamano = "normal", flecha = false, cargando = false, children, className = "", ...resto }: ComoEnlace | ComoBoton) {
  const contenido = (
    <>
      {children}
      {cargando ? <Carga /> : flecha && <IconoFlecha data-flecha="" />}
    </>
  );
  const datos = { "data-variante": variante, "data-tamano": tamano, className: `mv-boton ${className}` };

  if (resto.href !== undefined) {
    return (
      <Link {...(resto as Omit<ComoEnlace, keyof Comun>)} {...datos}>
        {contenido}
      </Link>
    );
  }
  const { type = "button", disabled, ...demas } = resto as Omit<ComoBoton, keyof Comun>;
  return (
    <button {...demas} {...datos} type={type} disabled={disabled || cargando} data-cargando={cargando || undefined} aria-busy={cargando || undefined}>
      {contenido}
    </button>
  );
}

/** Enlace de texto con flecha. Con `externo` abre otra pestaña. */
export function EnlaceFlecha({ href, externo = false, children }: { href: string; externo?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className="mv-enlace" {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
      {externo ? <IconoExterno /> : <IconoFlecha />}
      {externo && <span className="mv-oculto">(abre otra pestaña)</span>}
    </Link>
  );
}
