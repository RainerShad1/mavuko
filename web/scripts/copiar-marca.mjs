// Copia ../brand dentro de web: brand/ sigue siendo la única fuente de verdad.
// Las fuentes las sirve next/font, por eso aquí se quita el @import de Google Fonts.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(web, "..", "brand");
const destinoSrc = join(web, "src", "brand");
const destinoPublic = join(web, "public", "brand");

rmSync(destinoSrc, { recursive: true, force: true });
rmSync(destinoPublic, { recursive: true, force: true });
mkdirSync(destinoSrc, { recursive: true });
mkdirSync(destinoPublic, { recursive: true });

cpSync(join(brand, "react", "MavukoMarca.tsx"), join(destinoSrc, "MavukoMarca.tsx"));
const tokens = readFileSync(join(brand, "tokens.css"), "utf8").replace(/^@import url\(.*\);\r?\n/m, "");
writeFileSync(join(destinoSrc, "tokens.css"), tokens);

for (const carpeta of ["icono", "logo", "simbolo", "patron", "marca-de-agua", "palabra"]) {
  cpSync(join(brand, carpeta), join(destinoPublic, carpeta), { recursive: true });
}
console.log("Marca copiada a src/brand y public/brand");
