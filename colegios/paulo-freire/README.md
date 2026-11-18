# Sistema del Colegio Paulo Freire

Página web + panel administrativo + asistente de WhatsApp, en un solo Worker de Cloudflare con base de datos en Neon.

| Ruta | Qué es |
|---|---|
| `/` | Página web pública del colegio |
| `/panel/` | Panel administrativo (dirección y secretaría) |
| `/api/*` | API del panel (requiere sesión) |
| `/webhook` | Recibe los mensajes de WhatsApp (Meta) |
| Cron 8:00 a. m. | Recordatorios de pago automáticos (si el módulo está activo) |

## Estructura

```
public/           Página web y panel (archivos estáticos)
src/colegio.js    Datos del colegio: nombre, tarifas, grados, cuentas, textos del bot
src/bot.js        Conversación del asistente de WhatsApp
src/api.js        API del panel
src/avisos.js     Recibos, recordatorios, circulares
src/cobros.js     Reglas de pagos: vencido, por vencer, al día
db/schema.sql     Tablas de la base de datos
test/             Pruebas con una base de datos en memoria
```

Para otro colegio: copiar esta carpeta, cambiar `src/colegio.js`, el logo en `public/assets/` y el número en `wrangler.jsonc`, y crear otra base de datos en Neon.

## Probar en tu computadora

```
npm install
npm test                      # 49 pruebas del bot y la API
node test/servidor-local.mjs  # abre http://localhost:8787/panel/ (usuario: director, clave: prueba)
```

## Publicar en Cloudflare (una sola vez)

1. Sube esta carpeta a GitHub (`git push`).
2. En Cloudflare: **Workers & Pages → Create → Import a repository** → `RainerShad1/mavuko`.
   - **Root directory:** `colegios/paulo-freire`
   - **Deploy command:** `npx wrangler deploy`
   - En **Build watch paths** pon `colegios/paulo-freire/*` para que los cambios de la web de Mavuko (`web/`, `brand/`) no publiquen este proyecto.
3. En el Worker → **Settings → Variables and Secrets**, agrega como *Secret*:
   - `DATABASE_URL` → está en `CREDENCIALES-DEMO.txt`
   - `WA_VERIFY_TOKEN` → está en `CREDENCIALES-DEMO.txt`
   - `WA_TOKEN` → token permanente de usuario del sistema de Meta
   - `WA_APP_SECRET` → App Dashboard de Meta → Configuración → Básica → Clave secreta
4. Webhook en Meta: URL `https://paulo-freire.<tu-subdominio>.workers.dev/webhook`, token de verificación = `WA_VERIFY_TOKEN`, campo `messages`.

## Página web y redes sociales

Desde el panel → **Web y redes** se publican actividades y noticias (con fotos), se maneja la galería y la imagen de portada. Lo publicado aparece en la página y, si se marca, en Facebook e Instagram.

Para publicar de verdad en redes, agrega en Cloudflare:
- `FB_PAGE_ID` → ID de la página de Facebook
- `FB_PAGE_TOKEN` (Secret) → token de la página con permisos `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`
- `IG_USER_ID` → ID de la cuenta de Instagram profesional vinculada a esa página

Sin esas variables, la publicación en redes queda como "Simulado".

## Modo demo

Mientras `modoDemo` esté activo, el sistema **solo envía mensajes reales a las familias vinculadas a un número real** (desde el panel → WhatsApp → "Probar con tu teléfono"). Los demás envíos quedan como "Simulado". Así no se le escribe a números ajenos.

## Pendiente para usarlo en producción

- Plantilla de Meta aprobada para escribir fuera de la ventana de 24 h (recordatorios y recibos tardíos). Se configura con `WA_PLANTILLA_AVISO`.
- Carga real de familias desde el Excel de la secretaría y alta/edición de familias en el panel.
- Fotos de comprobantes: hoy se guardan en la base de datos; con muchos meses de uso conviene pasarlas a R2.

## Facturación interna

- Cada pago de mensualidad (desde el panel o aprobando un comprobante de WhatsApp) genera una factura `FAC-000123`.
- En **Facturación** se crean facturas de cualquier concepto (inscripción, libros, uniformes…), con descuento, cédula/RNC y estado pendiente o pagada. Solo la dirección puede anular.
- La familia recibe un enlace privado `/f/TOKEN` para ver, imprimir o guardar la factura en PDF. En WhatsApp puede escribir *FACTURAS* para ver las últimas.
- Son documentos internos, **no** comprobantes fiscales (e-CF). Los campos `ncf` y `fiscal` de la tabla `facturas` quedan listos para conectar un proveedor autorizado por la DGII.
- Para instalar en una base existente, vuelve a ejecutar `db/schema.sql` (solo agrega lo nuevo).
- Opcional: `PUBLIC_URL` define el dominio de los enlaces que se envían por WhatsApp.

## Becas, retiros y cierre del año escolar

- **Becas y descuentos fijos:** en la ficha de la familia → Editar datos, cada estudiante tiene beca en % y/o descuento fijo en RD$ con su motivo. La mensualidad con descuento se usa en cobros, facturas, recordatorios y el asistente.
- **Retiro:** "Retirar" fija el último mes que paga; lo anterior sigue pendiente y lo posterior ya no se cobra. Se puede reactivar.
- **Cierre del año** (solo dirección): sugiere promover a todos y egresar 6.º de Secundaria; se ajustan los que repiten o no siguen. Las mensualidades vencidas sin pagar pasan a "saldo del año anterior" (tabla `saldos`), que se cobra desde Facturación. Se fijan el primer mes y las tarifas del año nuevo (config `ano`). No borra pagos ni facturas; queda en el historial (tabla `anos`).
