import type { ComponentProps, ElementType, ReactNode } from "react";

export type Tema = "base" | "suave" | "melaza" | "cana" | "marca";

/** Campo de la página: fija el tema y el ritmo. Todo lo que tenga dentro hereda sus colores. */
export function Seccion({
  tema = "base",
  ritmo = "normal",
  as: Etiqueta = "section",
  className = "",
  children,
  ...resto
}: {
  tema?: Tema;
  ritmo?: "normal" | "pegada";
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"section">, "className" | "children">) {
  return (
    <Etiqueta data-tema={tema} data-ritmo={ritmo} className={`mv-seccion ${className}`} {...resto}>
      {children}
    </Etiqueta>
  );
}

/** Retícula de 16 columnas (3 + 5 + 8). Marca cada hijo con data-col="3|5|8|11|13". */
export function Reticula({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`mv-reticula ${className}`}>{children}</div>;
}

const FORMAS = {
  publicada: { texto: "Publicada", alto: 16 },
  disponible: { texto: "Disponible", alto: 16 },
  construccion: { texto: "En construcción", alto: 10 },
  pronto: { texto: "Más adelante", alto: 5 },
} as const;

/** Estado real de un sistema o página: un tallo pequeño que crece con el estado, más su texto. */
export function Estado({ tipo, texto }: { tipo: keyof typeof FORMAS; texto?: string }) {
  const { texto: base, alto } = FORMAS[tipo];
  return (
    <span className="mv-estado">
      <svg viewBox="0 0 13 16" aria-hidden="true" fill="currentColor">
        <polygon points={`0,${16 - alto + 2} 13,${16 - alto} 13,16 0,16`} />
      </svg>
      {texto ?? base}
    </span>
  );
}

/** Marca el material inventado para que nadie lo tome por real. */
export function MarcaEjemplo({ children = "Ejemplo" }: { children?: ReactNode }) {
  return <span className="mv-ejemplo">{children}</span>;
}
