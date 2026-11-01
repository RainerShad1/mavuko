import { Fragment } from "react";
import {
  Boton,
  Cabecera,
  CanalesContacto,
  EnlaceFlecha,
  Estado,
  GrupoPaginas,
  Heroe,
  LlamadaAccion,
  MarcoVideo,
  Navegacion,
  PalabraGiratoria,
  Pie,
  Reticula,
  Seccion,
  Surco,
  Surge,
  TarjetaPagina,
  TarjetaSistema,
} from "@/sistema";
import { ADAPTACION, ENLACES, ENLACES_PIE, NOTA_PIE, PAGINAS, PASOS, WHATSAPP } from "./datos";

export default function Inicio() {
  return (
    <>
      <a className="mv-saltar" href="#que-hacemos">
        Saltar al contenido
      </a>
      <Navegacion enlaces={ENLACES} accion={{ texto: "Escríbenos", href: "#contacto" }} />
      <main>
        <Heroe
          tituloAccesible="Menos trabajo a mano en tu negocio."
          lineas={[
            "Menos trabajo",
            "a mano en tu",
            <Fragment key="giro">
              <PalabraGiratoria palabras={["negocio", "restaurante", "tienda", "salón"]} />
            </Fragment>,
          ]}
          bajada="Creamos sistemas a la medida que le ahorran tiempo a tu negocio. Los instalamos, los adaptamos y los mantenemos, desde La Romana."
          acciones={
            <>
              <Boton href="#contacto" flecha>
                Escríbenos
              </Boton>
              <Boton href="#como-trabajamos" variante="borde">
                Cómo trabajamos
              </Boton>
            </>
          }
        />
        <MarcoVideo asoma titulo="Mira cómo trabajamos" nota="Video en preparación" />

        <Seccion id="que-hacemos" tema="suave">
          <Cabecera
            titulo="Una empresa de tecnología de La Romana."
            entrada="Partimos de una base común y la adaptamos a cada negocio. Así no tienes que cambiar tu forma de trabajar para que el sistema te sirva."
          />
          <ul className="grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
            {ADAPTACION.map((a) => (
              <li key={a.titulo} className="bg-fondo-2 p-s21 grid gap-s13 content-end min-h-[233px]">
                <h3 className="text-menor">{a.titulo}</h3>
                <p className="text-texto-2">{a.texto}</p>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion id="como-trabajamos">
          <Cabecera titulo="Instalamos, adaptamos y mantenemos." entrada="Tú sigues con tu negocio. La parte técnica nos toca a nosotros." />
          <Surco n={3}>
            {PASOS.map((p) => (
              <TarjetaSistema key={p.nombre} nombre={[p.nombre]} descripcion={p.texto} tono={p.tono} />
            ))}
          </Surco>
        </Seccion>

        <Seccion id="restaurantes" tema="suave">
          <Reticula className="items-end">
            <div data-col="11">
              <div className="mb-s13">
                <Estado tipo="construccion" texto="Próximo a lanzar" />
              </div>
              <Surge as="h2" className="text-titulo">
                Mavuko Restaurantes
              </Surge>
            </div>
            <div data-col="5" className="grid gap-s13 justify-items-start">
              <p className="text-entrada leading-[1.4] text-texto-2">Tu cliente pide desde la mesa con un QR, el mesero confirma y la cocina ve el pedido al instante. Lo estamos terminando y todavía no se puede contratar.</p>
              <EnlaceFlecha href="#contacto">¿Tienes un restaurante? Escríbenos y te avisamos cuando esté listo.</EnlaceFlecha>
            </div>
          </Reticula>
        </Seccion>

        <Seccion id="paginas">
          <Cabecera titulo="Páginas web que hemos creado." />
          <GrupoPaginas>
            {[
              ...PAGINAS.map((p) => <TarjetaPagina key={p.nombre} {...p} />),
              <TarjetaPagina key="tuya" nombre="Tu negocio" tipo="La próxima puede ser la tuya." pendiente="Tu página aquí" />,
            ]}
          </GrupoPaginas>
        </Seccion>

        <Seccion id="contacto" tema="melaza">
          <LlamadaAccion
            titulo="¿Qué necesita tu negocio?"
            texto="Cuéntanos qué haces a mano hoy y te decimos cómo resolverlo, sin lenguaje técnico."
            accion={
              <div className="max-w-[34rem]">
                <CanalesContacto canales={[{ nombre: "WhatsApp", detalle: "809-752-7776", href: WHATSAPP }]} />
              </div>
            }
          />
        </Seccion>
      </main>
      <Pie enlaces={ENLACES_PIE} nota={NOTA_PIE} />
    </>
  );
}
