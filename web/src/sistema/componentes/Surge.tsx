"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/** Marca el elemento con data-visto cuando su contenedor entra en pantalla. */
function useVisto<T extends Element>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se observa al padre: un elemento recortado del todo no reporta intersección.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.setAttribute("data-visto", "true");
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el.parentElement ?? el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** El contenido surge desde arriba al entrar. Sin JavaScript se ve normal. */
export function Surge({ as: Etiqueta = "div", className = "", children }: { as?: ElementType; className?: string; children: ReactNode }) {
  const ref = useVisto<HTMLElement>();
  return (
    <Etiqueta ref={ref} className={`mv-surge ${className}`}>
      {children}
    </Etiqueta>
  );
}

const PIEZAS: { o: number; forma: "r" | "p"; v: string | number[] }[] = [
  { o: 0, forma: "r", v: [21, 85.6] },
  { o: 1, forma: "p", v: "21,76.5 39,71.5 39,83 21,83" },
  { o: 1, forma: "r", v: [48, 85.6] },
  { o: 2, forma: "r", v: [48, 62.6] },
  { o: 3, forma: "p", v: "48,53.5 66,48.5 66,60 48,60" },
  { o: 2, forma: "r", v: [75, 85.6] },
  { o: 3, forma: "r", v: [75, 62.6] },
  { o: 4, forma: "r", v: [75, 39.6] },
  { o: 5, forma: "p", v: "75,19 93,14 93,37 75,37" },
];

/** El símbolo real se arma por segmentos, tallo por tallo, y la hoja llega al final. */
export function SimboloCrece({ className = "", titulo = "Mavuko" }: { className?: string; titulo?: string }) {
  const ref = useVisto<SVGSVGElement>();
  return (
    <svg ref={ref} className={`mv-simbolo-crece ${className}`} viewBox="17 -3 104 113" role="img" aria-label={titulo}>
      {PIEZAS.map((p, i) =>
        p.forma === "r" ? (
          <rect key={i} className="tr" style={{ "--o": p.o } as React.CSSProperties} x={(p.v as number[])[0]} y={(p.v as number[])[1]} width={18} height={20.4} />
        ) : (
          <polygon key={i} className="tr" style={{ "--o": p.o } as React.CSSProperties} points={p.v as string} />
        ),
      )}
      <path className="hj" style={{ "--o": 7 } as React.CSSProperties} d="M90 20 Q99 1 117 2 Q104 11 93 30 Z" />
    </svg>
  );
}
