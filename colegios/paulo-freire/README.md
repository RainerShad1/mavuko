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
npm test                      # 34 pruebas del bot y la API
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

## Modo demo

Mientras `modoDemo` esté activo, el sistema **solo envía mensajes reales a las familias vinculadas a un número real** (desde el panel → WhatsApp → "Probar con tu teléfono"). Los demás envíos quedan como "Simulado". Así no se le escribe a números ajenos.

## Pendiente para usarlo en producción

- Plantilla de Meta aprobada para escribir fuera de la ventana de 24 h (recordatorios y recibos tardíos). Se configura con `WA_PLANTILLA_AVISO`.
- Carga real de familias desde el Excel de la secretaría y alta/edición de familias en el panel.
- Fotos de comprobantes: hoy se guardan en la base de datos; con muchos meses de uso conviene pasarlas a R2.
