import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function Trazo({ d, ...rest }: Props & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  );
}

export const IconoFlecha = (p: Props) => <Trazo d="M3 12h17M13 5l7 7-7 7" {...p} />;
export const IconoExterno = (p: Props) => <Trazo d="M7 17 18 6M9 6h9v9" {...p} />;
export const IconoMas = (p: Props) => <Trazo d="M12 4v16M4 12h16" {...p} />;
export const IconoCerrar = (p: Props) => <Trazo d="M5 5l14 14M19 5 5 19" {...p} />;
export const IconoMenu = (p: Props) => <Trazo d="M3 7h18M3 12h18M3 17h18" {...p} />;
export const IconoCheck = (p: Props) => <Trazo d="M4 13l5 5L20 7" {...p} />;
export const IconoAlerta = (p: Props) => <Trazo d="M12 3 2 21h20L12 3zM12 10v5M12 18v.5" {...p} />;
export const IconoSol = (p: Props) => <Trazo d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" {...p} />;
export const IconoLuna = (p: Props) => <Trazo d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" {...p} />;

export function IconoPlay(p: Props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
      <path d="M5 2l17 10L5 22z" />
    </svg>
  );
}
