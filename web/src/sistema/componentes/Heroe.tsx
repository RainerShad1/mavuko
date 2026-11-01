"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAVUKO_COLORES } from "@/brand/MavukoMarca";
import { IconoPlay } from "./Iconos";
import { useMovimientoReducido } from "./medios";

/** Palabra del titular que cambia sola. La primera es la que se queda con movimiento reducido. */
export function PalabraGiratoria({ palabras, cada = 2600 }: { palabras: string[]; cada?: number }) {
  const caja = useRef<HTMLSpanElement>(null);
  const reducido = useMovimientoReducido();
  useEffect(() => {
    if (reducido || palabras.length < 2) return;
    let g = 0;
    const reloj = setInterval(() => {
      const hijos = caja.current?.children;
      if (!hijos) return;
      const sale = hijos[g] as HTMLElement;
      g = (g + 1) % hijos.length;
      const entra = hijos[g] as HTMLElement;
      sale.dataset.estado = "fue";
      entra.dataset.estado = "espera";
      void entra.offsetWidth;
      entra.dataset.estado = "ahora";
    }, cada);
    return () => clearInterval(reloj);
  }, [reducido, cada, palabras.length]);
  return (
    <span ref={caja} className="mv-giro">
      {palabras.map((p, i) => (
        <span key={p} data-estado={i === 0 ? "ahora" : "espera"}>
          {p}
        </span>
      ))}
    </span>
  );
}

const HOJA = "M15 6 Q24 -13 42 -12 Q29 -3 18 16 Z";
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mezcla = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/**
 * Campo de caña con la geometría exacta del símbolo: 18 de ancho, 9 de separación, nudo cada 23.
 * Ondula, crece al cargar y sube donde pasa el cursor. Se detiene fuera de pantalla.
 */
export function Canaveral() {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const reducido = useMovimientoReducido();

  useEffect(() => {
    const cont = caja.current;
    const cv = lienzo.current;
    const ctx = cv?.getContext("2d");
    if (!cont || !cv || !ctx) return;
    const C = { base: hex(MAVUKO_COLORES.bagazo), media: hex(MAVUKO_COLORES.cana), alta: hex(MAVUKO_COLORES.hoja), sol: MAVUKO_COLORES.sol };
    const hoja = new Path2D(HOJA);
    let W = 0, H = 0, esc = 1, paso = 27, n = 0, raf = 0, visible = true, px = 0, ultimo = -1e9;
    let alt: number[] = [], vel: number[] = [];
    const t0 = performance.now();

    const medir = () => {
      const r = cont.getBoundingClientRect();
      const d = Math.min(devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      cv.width = W * d;
      cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      esc = W < 640 ? 0.72 : 1;
      paso = 27 * esc;
      n = Math.ceil(W / paso) + 1;
      alt = Array.from({ length: n }, (_, i) => alt[i] ?? 0);
      vel = Array.from({ length: n }, (_, i) => vel[i] ?? 0);
    };

    const dibujar = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const inactivo = t - ultimo > 2500;
      const cursor = inactivo ? W * (0.5 + 0.46 * Math.sin(t * 0.00022)) : px;
      let cima = -1, max = 0;
      for (let i = 0; i < n; i++) {
        const x = i * paso;
        const ola = 0.46 + 0.1 * Math.sin(i * 0.34 + t * 0.00062) + 0.05 * Math.sin(i * 0.13 - t * 0.00041);
        const dx = x - cursor;
        const g = Math.exp(-(dx * dx) / (2 * 150 * 150)) * (inactivo ? 0.4 : 0.55);
        const entrada = reducido ? 1 : Math.min(1, Math.max(0, (t - t0 - i * 13) / 880));
        const meta = H * (ola + g) * (1 - Math.pow(1 - entrada, 4));
        vel[i] += (meta - alt[i]) * 0.05;
        vel[i] *= 0.8;
        alt[i] = reducido ? meta : alt[i] + vel[i];
        const h = Math.max(0, alt[i]);
        const r = h / H;
        if (h > max) {
          max = h;
          cima = i;
        }
        ctx.fillStyle = r < 0.62 ? mezcla(C.base, C.media, Math.max(0, (r - 0.46) / 0.16)) : mezcla(C.media, C.alta, Math.min(1, (r - 0.62) / 0.22));
        const w = 18 * esc, P = 23 * esc, S = 20.4 * esc, seg = Math.floor(h / P);
        for (let s = 0; s < seg; s++) ctx.fillRect(x, H - (s + 1) * P + (P - S), w, S);
        const resto = h - seg * P, y = H - seg * P, sube = Math.min(5 * esc, resto);
        if (resto > 2.6 * esc) {
          ctx.beginPath();
          ctx.moveTo(x, y - resto + sube);
          ctx.lineTo(x + w, y - resto);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x, y);
          ctx.fill();
        }
      }
      if (cima >= 0 && max / H > 0.68) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (max / H - 0.68) / 0.1);
        ctx.translate(cima * paso, H - max);
        ctx.scale(esc, esc);
        ctx.fillStyle = C.sol;
        ctx.fill(hoja);
        ctx.restore();
      }
    };

    const bucle = (t: number) => {
      if (visible && !document.hidden) dibujar(t);
      raf = requestAnimationFrame(bucle);
    };
    const quieto = () => dibujar(1e5);

    medir();
    const ro = new ResizeObserver(() => {
      medir();
      if (reducido) quieto();
    });
    ro.observe(cont);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(cont);
    const zona = cont.parentElement ?? cont;
    const alMover = (e: PointerEvent) => {
      px = e.clientX - cont.getBoundingClientRect().left;
      ultimo = performance.now();
    };
    if (reducido) quieto();
    else {
      raf = requestAnimationFrame(bucle);
      zona.addEventListener("pointermove", alMover, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      zona.removeEventListener("pointermove", alMover);
    };
  }, [reducido]);

  return (
    <div ref={caja} className="mv-canaveral" aria-hidden="true">
      <canvas ref={lienzo} />
    </div>
  );
}

/**
 * Héroe: titular por líneas, bajada, acciones y el cañaveral.
 * `tituloAccesible` es la frase completa que leen los lectores de pantalla.
 */
export function Heroe({
  tituloAccesible,
  lineas,
  bajada,
  acciones,
  canaveral = true,
}: {
  tituloAccesible: string;
  lineas: ReactNode[];
  bajada: ReactNode;
  acciones?: ReactNode;
  canaveral?: boolean;
}) {
  return (
    <section className="mv-heroe" data-tema="melaza">
      <div className="mv-heroe-texto">
        <h1>
          <span className="mv-oculto">{tituloAccesible}</span>
          <span aria-hidden="true">
            {lineas.map((l, i) => (
              <span className="mv-ln" key={i}>
                <span style={{ "--i": i } as React.CSSProperties}>{l}</span>
              </span>
            ))}
          </span>
        </h1>
        <div className="mv-heroe-pie">
          <p>{bajada}</p>
          {acciones && <div className="mv-acciones">{acciones}</div>}
        </div>
      </div>
      {canaveral && <Canaveral />}
    </section>
  );
}

/**
 * Espacio del video horizontal. Sin `src` queda como espacio previsto y no finge ser un reproductor.
 * Con `asoma` sube sobre el héroe y crece hasta su ancho completo al bajar.
 */
export function MarcoVideo({
  src,
  poster,
  subtitulos,
  titulo = "Mira cómo funciona",
  nota = "Espacio para el video · en preparación",
  asoma = false,
}: {
  src?: string;
  poster?: string;
  subtitulos?: string;
  titulo?: string;
  nota?: string;
  asoma?: boolean;
}) {
  const sec = useRef<HTMLElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const reducido = useMovimientoReducido();

  useEffect(() => {
    const m = marco.current;
    const s = sec.current;
    if (!asoma || reducido || !m || !s) {
      m?.style.removeProperty("--e");
      return;
    }
    let pendiente = false;
    const medir = () => {
      pendiente = false;
      const inicio = innerWidth < 640 ? 0.92 : 0.66;
      const r = s.getBoundingClientRect();
      const v = innerHeight;
      const p = Math.min(1, Math.max(0, (v - r.top - v * 0.1) / (v * 0.62)));
      m.style.setProperty("--e", (inicio + (1 - inicio) * (1 - Math.pow(1 - p, 2))).toFixed(4));
    };
    const alMover = () => {
      if (!pendiente) {
        pendiente = true;
        requestAnimationFrame(medir);
      }
    };
    medir();
    addEventListener("scroll", alMover, { passive: true });
    addEventListener("resize", alMover);
    return () => {
      removeEventListener("scroll", alMover);
      removeEventListener("resize", alMover);
    };
  }, [asoma, reducido]);

  const reproducir = () => {
    setReproduciendo(true);
    void video.current?.play();
  };

  return (
    <section ref={sec} className="mv-video-sec" data-tema="base" data-asoma={asoma} aria-label="Video de presentación">
      <div ref={marco} className="mv-marco" data-tema="melaza">
        {src ? (
          <video ref={video} src={src} poster={poster} controls={reproduciendo} preload="none" playsInline>
            {subtitulos && <track kind="captions" src={subtitulos} srcLang="es" label="Español" default />}
          </video>
        ) : (
          <span className="mv-marco-patron" aria-hidden="true" />
        )}
        {src ? (
          !reproduciendo && (
            <button type="button" className="mv-play" onClick={reproducir}>
              <i>
                <IconoPlay />
              </i>
              <b>{titulo}</b>
            </button>
          )
        ) : (
          <>
            <span className="mv-play">
              <i>
                <IconoPlay />
              </i>
              <b>{titulo}</b>
            </span>
            <small className="mv-marco-nota">{nota}</small>
          </>
        )}
      </div>
    </section>
  );
}
