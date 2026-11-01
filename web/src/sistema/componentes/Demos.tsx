import type { CSSProperties } from "react";
import { MarcaEjemplo } from "./Base";

// Demostraciones con datos inventados: siempre llevan la marca "Ejemplo".

export function DemoWeb() {
  return (
    <>
      <div className="mv-d-web">
        <div className="mv-d-barra">
          <span>tunegocio.com</span>
        </div>
        <div className="mv-d-sitio">
          <div className="mv-d-menu">
            <i />
            Tu negocio
          </div>
          <div className="mv-d-grande">
            <b>Tu página, a tu manera</b>
            <em>Pedir ahora</em>
          </div>
          <div className="mv-d-tres">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <MarcaEjemplo />
    </>
  );
}

export function DemoPedido() {
  return (
    <>
      <div className="mv-d-pedido">
        <div className="mv-d-cab">
          Mesa 4 <small>Pedido por QR</small>
        </div>
        <div className="mv-d-fila">
          <span>2 Mofongo</span>
          <span>RD$ 900</span>
        </div>
        <div className="mv-d-fila">
          <span>1 Jugo de chinola</span>
          <span>RD$ 150</span>
        </div>
        <div className="mv-d-fila">
          <span>1 Tostones</span>
          <span>RD$ 200</span>
        </div>
        <div className="mv-d-estados">
          <span>Nuevo</span>
          <span>Preparando</span>
          <span>Listo</span>
        </div>
      </div>
      <MarcaEjemplo />
    </>
  );
}

export function DemoRed() {
  return (
    <>
      <div className="mv-d-red">
        <svg viewBox="0 0 400 320" preserveAspectRatio="xMidYMid meet">
          <path className="hilo" d="M200 150 L80 70" />
          <path className="hilo" d="M200 150 L320 70" />
          <path className="hilo" d="M200 150 L200 262" />
          <g>
            <path className="pulso" d="M200 150 L80 70" />
            <path className="pulso" d="M200 150 L320 70" />
            <path className="pulso" d="M200 150 L200 262" />
          </g>
          <rect className="punto" x="172" y="122" width="56" height="56" />
          <path className="glifo" d="M184 146q16-13 32 0M190 154q10-8 20 0M198 162h4" />
          <rect className="punto" x="52" y="42" width="56" height="56" />
          <path className="glifo" d="M64 56h32v20H64zM58 84h44" />
          <rect className="punto" x="292" y="42" width="56" height="56" />
          <path className="glifo" d="M304 58h24v24h-24zM328 66l12-6v24l-12-6" />
          <rect className="punto" x="172" y="234" width="56" height="56" />
          <path className="glifo" d="M190 246h20v34h-20zM198 274h4" />
          <text x="80" y="118">Equipos</text>
          <text x="320" y="118">Cámaras</text>
          <text x="262" y="266">Celulares</text>
          <text x="262" y="154">Red</text>
        </svg>
      </div>
      <MarcaEjemplo />
    </>
  );
}

const BARRAS = [30, 38, 30, 50, 62, 50, 80, 100];

export function DemoNumeros() {
  return (
    <>
      <div className="mv-d-num">
        <header>
          Ventas de la semana <b>RD$ 48,200</b>
        </header>
        <div className="mv-d-barras">
          {BARRAS.map((a, n) => (
            <i key={n} style={{ "--a": a, "--n": n } as CSSProperties} />
          ))}
        </div>
      </div>
      <MarcaEjemplo />
    </>
  );
}
