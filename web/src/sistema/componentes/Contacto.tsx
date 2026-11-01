"use client";

import { useId, useState, type ComponentProps, type FocusEvent, type ReactNode } from "react";
import { Boton } from "./Boton";
import { IconoAlerta, IconoCheck, IconoFlecha } from "./Iconos";

type Comun = { etiqueta: string; ayuda?: string; error?: string; opcional?: boolean };

function Envoltura({ id, etiqueta, ayuda, error, opcional, children }: Comun & { id: string; children: ReactNode }) {
  return (
    <div className="mv-campo-f" data-error={error ? "true" : undefined}>
      <label htmlFor={id}>
        {etiqueta} {opcional && <span>(opcional)</span>}
      </label>
      {children}
      {ayuda && !error && (
        <span className="mv-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </span>
      )}
      {error && (
        <span className="mv-error" id={`${id}-error`} role="alert">
          <IconoAlerta />
          {error}
        </span>
      )}
    </div>
  );
}

const describir = (id: string, c: Comun) => (c.error ? `${id}-error` : c.ayuda ? `${id}-ayuda` : undefined);

/** Campo de una línea con etiqueta visible, ayuda y error. El error se ve con ícono y texto, sin rojo. */
export function CampoTexto({ etiqueta, ayuda, error, opcional, ...resto }: Comun & Omit<ComponentProps<"input">, "id">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} opcional={opcional}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describir(id, { etiqueta, ayuda, error })} {...resto} />
    </Envoltura>
  );
}

export function CampoArea({ etiqueta, ayuda, error, opcional, ...resto }: Comun & Omit<ComponentProps<"textarea">, "id">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} opcional={opcional}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describir(id, { etiqueta, ayuda, error })} {...resto} />
    </Envoltura>
  );
}

export function Aviso({ tipo, children }: { tipo: "exito" | "error"; children: ReactNode }) {
  return (
    <div className="mv-aviso" role={tipo === "error" ? "alert" : "status"}>
      {tipo === "exito" ? <IconoCheck /> : <IconoAlerta />}
      <div>{children}</div>
    </div>
  );
}

export type DatosContacto = { nombre: string; contacto: string; mensaje: string };
type Errores = Partial<Record<keyof DatosContacto, string>>;

function validar(d: DatosContacto): Errores {
  const e: Errores = {};
  if (!d.nombre.trim()) e.nombre = "Escribe tu nombre para saber cómo llamarte.";
  if (!d.contacto.trim()) e.contacto = "Déjanos un teléfono o correo para poder responderte.";
  if (d.mensaje.trim().length < 5) e.mensaje = "Cuéntanos en pocas palabras qué necesitas.";
  return e;
}

/** Formulario de contacto. La página pasa `onEnviar`; si falla, se conserva lo escrito. */
export function FormularioContacto({ onEnviar }: { onEnviar: (datos: DatosContacto) => Promise<void> }) {
  const [errores, setErrores] = useState<Errores>({});
  const [estado, setEstado] = useState<"quieto" | "enviando" | "enviado" | "fallo">("quieto");

  const datos = (f: HTMLFormElement): DatosContacto => {
    const d = new FormData(f);
    return { nombre: String(d.get("nombre") ?? ""), contacto: String(d.get("contacto") ?? ""), mensaje: String(d.get("mensaje") ?? "") };
  };
  // Al salir del campo solo se revisa el error que ya estaba, para no regañar antes de tiempo.
  const alSalir = (campo: keyof DatosContacto) => (ev: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const f = ev.currentTarget.form;
    if (f && errores[campo]) setErrores((e) => ({ ...e, [campo]: validar(datos(f))[campo] }));
  };

  const enviar = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const d = datos(f);
    const e = validar(d);
    setErrores(e);
    const primero = Object.keys(e)[0];
    if (primero) {
      (f.elements.namedItem(primero) as HTMLElement | null)?.focus();
      return;
    }
    setEstado("enviando");
    try {
      await onEnviar(d);
      setEstado("enviado");
      f.reset();
    } catch {
      setEstado("fallo");
    }
  };

  return (
    <form className="mv-form" onSubmit={enviar} noValidate>
      <div className="mv-form-doble">
        <CampoTexto etiqueta="Tu nombre" name="nombre" autoComplete="name" error={errores.nombre} onBlur={alSalir("nombre")} />
        <CampoTexto etiqueta="Teléfono o correo" name="contacto" autoComplete="tel" error={errores.contacto} onBlur={alSalir("contacto")} />
      </div>
      <CampoArea etiqueta="¿Qué necesita tu negocio?" name="mensaje" ayuda="Con una o dos líneas basta." error={errores.mensaje} onBlur={alSalir("mensaje")} />
      {estado === "enviado" && <Aviso tipo="exito">Recibimos tu mensaje. Te escribimos pronto.</Aviso>}
      {estado === "fallo" && <Aviso tipo="error">No se pudo enviar. Revisa tu conexión e inténtalo de nuevo; lo que escribiste sigue aquí.</Aviso>}
      <div>
        <Boton type="submit" flecha cargando={estado === "enviando"}>
          {estado === "enviando" ? "Enviando" : "Enviar mensaje"}
        </Boton>
      </div>
    </form>
  );
}

export function CanalesContacto({ canales }: { canales: { nombre: string; detalle: string; href: string }[] }) {
  return (
    <ul className="mv-canales">
      {canales.map((c) => (
        <li key={c.nombre}>
          <a href={c.href}>
            <span>
              {c.nombre}
              <small>{c.detalle}</small>
            </span>
            <IconoFlecha />
          </a>
        </li>
      ))}
    </ul>
  );
}
