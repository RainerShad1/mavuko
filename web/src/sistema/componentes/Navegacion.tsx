"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MavukoLogo } from "@/brand/MavukoMarca";
import { Boton } from "./Boton";
import { IconoCerrar, IconoMenu } from "./Iconos";

export type EnlaceNav = { texto: string; href: string; actual?: boolean };

/**
 * Barra principal. Con `fija` toma el tema del campo que tiene debajo y se compacta al bajar.
 * En celular los enlaces pasan a una hoja que cae desde arriba.
 */
export function Navegacion({
  enlaces,
  accion,
  fija = true,
  temaInicial = "melaza",
}: {
  enlaces: EnlaceNav[];
  accion?: { texto: string; href: string };
  fija?: boolean;
  temaInicial?: "base" | "suave" | "melaza";
}) {
  const barra = useRef<HTMLElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const idMenu = useId();

  useEffect(() => {
    if (!fija) return;
    let pendiente = false;
    const medir = () => {
      pendiente = false;
      const nav = barra.current;
      if (!nav) return;
      nav.dataset.compacta = String(scrollY > 34);
      const debajo = document.elementsFromPoint(innerWidth / 2, 34).find((el) => !nav.contains(el) && el.closest("[data-tema]"));
      const tema = debajo?.closest("[data-tema]")?.getAttribute("data-tema");
      if (tema) nav.dataset.tema = tema === "cana" ? "melaza" : tema;
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
  }, [fija]);

  useEffect(() => {
    const nav = barra.current;
    if (!abierta || !nav) return;
    const previo = document.body.style.overflow;
    const temaPrevio = nav.dataset.tema;
    document.body.style.overflow = "hidden";
    nav.dataset.tema = "melaza";
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierta(false);
        boton.current?.focus();
      }
    };
    addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = previo;
      if (temaPrevio) nav.dataset.tema = temaPrevio;
      removeEventListener("keydown", alTeclear);
    };
  }, [abierta]);

  return (
    <>
      <header ref={barra} className="mv-nav" data-tema={temaInicial} data-fija={fija} data-compacta="false">
        <Link className="mv-logo-doble" href="/" aria-label="Mavuko, inicio">
          <MavukoLogo className="c" variante="color" aria-hidden="true" />
          <MavukoLogo className="o" variante="oscuro" aria-hidden="true" />
        </Link>
        <nav aria-label="Principal" style={{ marginLeft: "auto" }} className="max-md:hidden">
          <ul className="mv-nav-enlaces">
            {enlaces.map((e) => (
              <li key={e.texto}>
                <Link href={e.href} aria-current={e.actual ? "page" : undefined}>
                  {e.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {accion && (
          <Boton href={accion.href} tamano="chico">
            {accion.texto}
          </Boton>
        )}
        <button ref={boton} type="button" className="mv-nav-menu" aria-expanded={abierta} aria-controls={idMenu} aria-label={abierta ? "Cerrar menú" : "Abrir menú"} onClick={() => setAbierta((a) => !a)}>
          {abierta ? <IconoCerrar /> : <IconoMenu />}
        </button>
      </header>
      <div id={idMenu} className="mv-nav-hoja md:hidden" data-tema="melaza" data-abierta={abierta}>
        <ul>
          {enlaces.map((e) => (
            <li key={e.texto}>
              <Link href={e.href} onClick={() => setAbierta(false)} aria-current={e.actual ? "page" : undefined}>
                {e.texto}
              </Link>
            </li>
          ))}
        </ul>
        {accion && (
          <Boton href={accion.href} flecha onClick={() => setAbierta(false)}>
            {accion.texto}
          </Boton>
        )}
      </div>
    </>
  );
}
