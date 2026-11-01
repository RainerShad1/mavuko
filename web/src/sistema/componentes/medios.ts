"use client";

import { useSyncExternalStore } from "react";

function useMedia(consulta: string) {
  return useSyncExternalStore(
    (avisar) => {
      const m = matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => matchMedia(consulta).matches,
    () => false,
  );
}

export const useMovimientoReducido = () => useMedia("(prefers-reduced-motion: reduce)");
export const useCelular = () => useMedia("(max-width: 899px)");
