import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
  weight: "variable",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mavuko, soluciones tecnológicas",
  description: "Sistemas a la medida para que tu negocio ahorre tiempo y automatice su trabajo, desde La Romana.",
  icons: { icon: "/brand/icono/favicon.ico", apple: "/brand/icono/mavuko-icono-180.png" },
};

// Antes de pintar: activa las animaciones de entrada y aplica el modo elegido.
const arranque = `document.documentElement.classList.add('js');try{var m=localStorage.getItem('mavuko-modo')||(matchMedia('(prefers-color-scheme: dark)').matches?'oscuro':'claro');document.documentElement.dataset.modo=m}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${bricolage.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: arranque }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
