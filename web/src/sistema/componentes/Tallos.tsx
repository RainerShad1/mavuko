"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconoFlecha, IconoMas } from "./Iconos";
import { useCelular, useMovimientoReducido } from "./medios";

export type LineaTallo = {
  /** Dos partes: la marca y la línea, por ejemplo ["Mavuko", "Restaurants"]. */
  nombre: [string, string];
  descripcion: string;
  tono: "nudo" | "melaza" | "hoja" | "cana";
  demo: ReactNode;
  accion: { texto: string; href: string };
};

const CICLO = 6000;

/**
 * Líneas de servicio como tallos sobre una base común. El abierto es el más alto y los vecinos
 * bajan por la serie 8, 5, 3. Rota solo hasta que alguien interactúa. En celular es un acordeón.
 */
export function Tallos({ lineas, rotar = true }: { lineas: LineaTallo[]; rotar?: boolean }) {
  const campo = useRef<HTMLUListElement>(null);
  const cambio = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [activo, setActivo] = useState(0);
  const [auto, setAuto] = useState(rotar);
  const [dentro, setDentro] = useState(false);
  const [enVista, setEnVista] = useState(false);
  const reducido = useMovimientoReducido();
  const celular = useCelular();
  const pausado = !auto || dentro || !enVista || reducido || celular;

  useEffect(() => {
    cambio.current = performance.now();
  }, [activo]);

  useEffect(() => {
    if (pausado) return;
    const t = setTimeout(() => setActivo((a) => (a + 1) % lineas.length), CICLO);
    return () => clearTimeout(t);
  }, [pausado, activo, lineas.length]);

  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setEnVista(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    const ajustar = () => {
      const gaps = (lineas.length - 1) * 5;
      el.style.setProperty("--abierto", `${((el.clientWidth - gaps) * 5) / (lineas.length + 4)}px`);
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [lineas.length]);

  return (
    <ul
      ref={campo}
      className="mv-campo"
      style={{ "--columnas": lineas.map((_, k) => (k === activo ? "5fr" : "1fr")).join(" ") } as CSSProperties}
      onPointerEnter={() => setDentro(true)}
      onPointerLeave={() => setDentro(false)}
      onFocus={() => setAuto(false)}
    >
      {lineas.map((l, i) => {
        const distancia = Math.abs(i - activo);
        const nombre = l.nombre.join(" ");
        const abierto = i === activo;
        return (
          <li
            key={nombre}
            className="mv-tallo"
            data-tono={l.tono}
            data-altura={abierto ? 8 : distancia === 1 ? 5 : 3}
            data-corre={abierto && !pausado}
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse" || celular || abierto) return;
              espera.current = setTimeout(() => {
                if (performance.now() - cambio.current > 380) setActivo(i);
              }, 180);
            }}
            onPointerLeave={() => clearTimeout(espera.current)}
          >
            <div className="mv-cuerpo">
              <button
                type="button"
                className="mv-abrir"
                aria-expanded={abierto}
                aria-controls={`mv-tallo-${i}`}
                aria-label={nombre}
                onClick={() => {
                  setAuto(false);
                  setActivo(i);
                }}
              >
                <span className="mv-abrir-texto">{nombre}</span>
                <IconoMas className="mv-signo" />
              </button>
              <span className="mv-vertical" aria-hidden="true">
                {nombre}
              </span>
              <div className="mv-panel-c">
                <div className="mv-panel" id={`mv-tallo-${i}`}>
                  <div className="mv-texto">
                    <h3>
                      <span>{l.nombre[0]}</span>
                      <span>{l.nombre[1]}</span>
                    </h3>
                    <p>{l.descripcion}</p>
                  </div>
                  <div className="mv-demo" aria-hidden="true" data-demo-activa={abierto && !reducido}>
                    {l.demo}
                  </div>
                  <Link className="mv-ver" href={l.accion.href}>
                    {l.accion.texto}
                    <IconoFlecha />
                  </Link>
                </div>
              </div>
            </div>
            <span className="mv-corte">{abierto && <span className="mv-avance" key={activo} />}</span>
            <span className="mv-corte" data-n="2" />
          </li>
        );
      })}
    </ul>
  );
}
