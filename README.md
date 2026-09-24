# PAGOS-UNIVERSALES

Cobro automático de servicios y suscripciones (Netflix, EPM, Claro, gimnasio, administración,
etc.) contra la tarjeta de crédito del cliente, con límites de seguridad, reintentos,
notificaciones y desembolso al facturador.

> Estado: **MVP funcional** (motor de cobro, programador, panel de administración, pasarela
> simulada y adaptador real para Wompi). No está certificado para producción — ver
> [Limitaciones actuales](#limitaciones-actuales-honestas) y [Roadmap a producto](#roadmap-a-producto).

## Índice

- [Qué es](#qué-es)
- [Arquitectura](#arquitectura)
- [Cómo correr](#cómo-correr)
- [Primer usuario (Diego, admin)](#primer-usuario-diego-admin)
- [Tarjetas de prueba](#tarjetas-de-prueba)
- [Activar Wompi real](#activar-wompi-real)
- [Flujo de desembolso manual](#flujo-de-desembolso-manual)
- [Variables de entorno](#variables-de-entorno)
- [Pruebas](#pruebas)
- [Roadmap a producto](#roadmap-a-producto)
- [Limitaciones actuales (honestas)](#limitaciones-actuales-honestas)

## Qué es

Un cliente registra su tarjeta de crédito (tokenizada, nunca se guarda el PAN/CVV) y los
servicios que quiere que se paguen solos: monto fijo (Netflix, Spotify, gimnasio...) o variable
(factura de energía, agua, administración...). El sistema:

1. **Cobra (pull)** el monto a la tarjeta unos días antes del vencimiento, vía una pasarela de
   pagos (`PaymentGateway`).
2. **Desembolsa (push)** el dinero al facturador (`PayoutProvider`) — en v1, un operador humano lo
   hace desde el panel de administración y registra el comprobante ("modelo concierge").
3. Si el monto supera un tope configurado (por servicio o mensual total del usuario), el pago
   queda **pendiente de aprobación** en vez de cobrarse automáticamente.
4. Cada cambio de estado genera **notificación** al usuario (in-app y, si hay SMTP, por email) y
   queda en un **historial auditable** (`AuditLog`).

El diseño completo (modelo de datos, ciclo de vida de un pago, motor de programación) está en
[`docs/DISENO.md`](docs/DISENO.md).

## Arquitectura

```
┌─────────────┐  cookie httpOnly (JWT)   ┌───────────────┐        ┌──────────────┐
│  Frontend    │ ───────────────────────▶│    Backend     │───────▶│  PostgreSQL  │
│  Next.js 14  │  /api/* (rewrite)        │  Express + zod │        │  (Prisma)    │
│  pages router│◀─────────────────────── │                │◀───────│              │
└─────────────┘                           └───────┬───────┘        └──────────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                    PaymentGateway          BillerProvider         PayoutProvider
                 (simulated | wompi)      (simulated, fetchBill)   (manual, cola admin)
```

- **Backend** (`backend/`): Node 20, Express 4, Prisma 5 sobre PostgreSQL 16, ESM. Autenticación
  con JWT en cookie httpOnly. Validación de entrada con `zod`. `node-cron` corre el motor de
  programación (`runTick`) cada `SCHEDULER_CRON` (por defecto cada 5 min); también se puede
  disparar manualmente desde el panel de administración.
- **Frontend** (`frontend/`): Next.js 14 (pages router), React 18, sin framework CSS pesado — CSS
  propio con tokens y modo oscuro. Todas las llamadas van a `/api/*` (mismo origen, vía rewrites de
  `next.config.js` hacia `BACKEND_URL`), para que la cookie httpOnly viaje automáticamente.
- **Proveedores intercambiables** (`backend/src/providers/`): la pasarela de cobro
  (`gateways/simulated.js` | `gateways/wompi.js`), el proveedor de facturas variables
  (`billers/simulated.js`) y el proveedor de desembolso (`payouts/manual.js`) están detrás de una
  interfaz común, para poder reemplazarlos sin tocar el motor de pagos.
- **Zona horaria de negocio**: `America/Bogota` (UTC-5 fijo, sin horario de verano) — toda la
  aritmética de fechas de vencimiento/programación vive en `backend/src/lib/dates.js`.

## Cómo correr

### Opción A — docker compose (recomendada)

Requiere Docker y Docker Compose.

```bash
cp .env.example .env   # ajusta lo que necesites (o déjalo por defecto para probar local)
docker compose up --build
```

Esto levanta Postgres, corre las migraciones (`prisma migrate deploy`) y siembra el catálogo de
facturadores + el usuario admin al arrancar el backend, y sirve:

- Backend: http://localhost:4000
- Frontend: http://localhost:3000

> Nota: el `docker-compose.yml` no corre `migrate`/`seed` automáticamente dentro del contenedor;
> si tu imagen de backend no lo hace en el entrypoint, ejecútalos una vez:
> `docker compose exec backend npm run migrate && docker compose exec backend npm run seed`.

### Opción B — script de desarrollo

```bash
./scripts/dev.sh
```

Ver el script para el detalle exacto de lo que automatiza (típicamente: verifica Postgres,
instala dependencias, corre migraciones/seed y levanta backend + frontend en modo desarrollo).

### Opción C — manual

Requiere Node 18+ y PostgreSQL 16 corriendo localmente.

```bash
# 1. Base de datos
createdb pagos_universales
createdb pagos_test   # usada por la suite de pruebas

# 2. Backend
cd backend
cp ../.env.example .env   # o exporta las variables directamente
npm install
npm run migrate           # prisma migrate deploy
npm run seed               # siembra catálogo de facturadores + usuario admin
npm run dev                 # http://localhost:4000

# 3. Frontend (otra terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000 (usa BACKEND_URL=http://localhost:4000 por defecto)
```

Para correr el frontend en modo producción localmente: `npm run build && npm start` (revisa
`BACKEND_URL` en el entorno antes de arrancar — ver nota en `frontend/next.config.js` sobre por
qué este proyecto **no** usa `output: "standalone"`).

## Primer usuario (Diego, admin)

Al correr `npm run seed` (o al arrancar el contenedor de backend) se crea/actualiza un usuario
administrador con:

- **Email**: `ADMIN_EMAIL` (por defecto `diego@pelletier.com.co`)
- **Contraseña**: `ADMIN_PASSWORD` (por defecto, solo fuera de producción, `CambiaEsta123!` —
  imprime una advertencia en consola). **En producción `ADMIN_PASSWORD` es obligatoria**, el seed
  falla si no está definida.
- **Rol**: `ADMIN` (acceso a `/admin`: métricas, cola de desembolsos, listado de usuarios,
  disparo manual del programador).

Por defecto, volver a correr `npm run seed` **no** pisa la contraseña de un admin que ya existe
(para no perder un cambio de contraseña hecho desde la app). Si necesitas forzar el reseteo
(por ejemplo, para recuperar acceso en un entorno de pruebas), define `ADMIN_RESET_PASSWORD=true`
antes de correr el seed.

**Cambiar la contraseña**: hoy no hay un flujo de "cambiar contraseña" en la UI de `/perfil`; la
forma soportada es re-sembrar con `ADMIN_PASSWORD` nuevo + `ADMIN_RESET_PASSWORD=true`, o
actualizar `passwordHash` directamente en la base de datos (`bcryptjs`, costo 10). Un flujo de
autoservicio para cambiar contraseña está en el roadmap.

## Tarjetas de prueba

Con `PAYMENT_GATEWAY=simulated` (valor por defecto, no requiere llaves), agrega una tarjeta desde
`/tarjetas` usando cualquiera de estos números (ver `backend/src/providers/gateways/simulated.js`):

| Número                | Comportamiento al cobrar          |
|------------------------|------------------------------------|
| `4111 1111 1111 1111`  | Aprueba siempre                    |
| `4000 0000 0000 0002`  | Declina (tarjeta rechazada)        |
| `4000 0000 0000 9995`  | Fondos insuficientes                |
| Cualquier otra con Luhn válido | Aprueba                    |

Los reintentos automáticos (hasta 3 intentos: inmediato, +1h, +6h) y el paso a `FAILED` se pueden
probar con la tarjeta que declina.

## Activar Wompi real

1. Crea una cuenta de comercio en [Wompi](https://wompi.co) (Bancolombia). Wompi te pedirá, entre
   otras cosas: datos legales del comercio, cuenta bancaria de desembolso, y — para cobros
   recurrentes sin que el cliente vuelva a digitar la tarjeta — habilitar *payment sources*
   (tokenización) en tu comercio.
2. En el sandbox de Wompi obtén: llave pública, llave privada y secreto de integridad.
3. Configura en `.env` (o las variables del contenedor):
   ```
   PAYMENT_GATEWAY=wompi
   WOMPI_ENV=sandbox
   WOMPI_PUBLIC_KEY=pub_test_...
   WOMPI_PRIVATE_KEY=prv_test_...
   WOMPI_INTEGRITY_SECRET=...
   ```
4. Con `PAYMENT_GATEWAY=wompi`, `/tarjetas` deja de aceptar números de tarjeta de prueba y
   tokeniza directamente contra la API pública de Wompi desde el navegador del cliente (nunca pasa
   por el backend), y solo el token resultante se envía y se cifra (`ENCRYPTION_KEY`,
   AES-256-GCM) antes de guardarse.
5. **Sandbox → producción**: cuando Wompi apruebe tu comercio para producción, cambia
   `WOMPI_ENV=production` y reemplaza las tres llaves por las de producción (`pub_prod_...`,
   `prv_prod_...`). `WOMPI_API_URL` se deriva automáticamente de `WOMPI_ENV`
   (`https://production.wompi.co/v1`), o puedes sobreescribirla manualmente.
6. El adaptador vive en `backend/src/providers/gateways/wompi.js` — si tu integración necesita
   comportamiento adicional (3DS, webhooks de confirmación asíncrona, etc.), es el único archivo
   que debería cambiar.

## Flujo de desembolso manual

En v1 el desembolso al facturador (EPM, Netflix, el gimnasio...) es manual ("modelo concierge"):
no hay integración con un agregador de recaudo todavía.

1. Cuando un pago se cobra exitosamente a la tarjeta (`CHARGED`), pasa automáticamente a
   `DISBURSING` y aparece en la **cola de desembolsos** del panel `/admin`.
2. Un operador humano realiza el pago real al facturador por fuera del sistema (PSE, transferencia,
   portal del facturador, etc.).
3. Desde `/admin`, el operador marca el pago:
   - **"Marcar pagado"**: registra la referencia del pago y, opcionalmente, la URL del comprobante
     → el pago pasa a `PAID` y se notifica al usuario.
   - **"Marcar fallido"**: registra el motivo → el pago pasa a `REFUND_PENDING` y el sistema
     intenta reembolsar el cobro original a la tarjeta del cliente (`gateway.refund`); si el
     reembolso también falla, queda en `REFUND_PENDING` para reintento/seguimiento manual.

Este flujo es intencionalmente simple para el MVP; ver [Roadmap](#roadmap-a-producto) para el plan
de automatizarlo con agregadores de recaudo por facturador.

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa y comentada. Resumen de las más
relevantes:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_TEST` | Conexión a Postgres (app y suite de pruebas) |
| `JWT_SECRET` / `ENCRYPTION_KEY` | Firma de sesión / cifrado de tokens de tarjeta — **obligatorias en producción** |
| `CORS_ORIGINS` | Orígenes permitidos (con credenciales) para el API, separados por coma (default `http://localhost:3000`) |
| `PAYMENT_GATEWAY` | `simulated` (default) o `wompi` |
| `FEE_PERCENT` / `FEE_FIXED_COP` | Comisión del producto sobre cada cobro |
| `SCHEDULER_ENABLED` / `SCHEDULER_CRON` | Encender/apagar y frecuencia del motor de programación |
| `SMTP_*` | Envío de email para notificaciones (opcional; sin `SMTP_HOST` solo quedan in-app) |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` / `ADMIN_RESET_PASSWORD` | Usuario admin sembrado |
| `BACKEND_URL` (frontend) | A dónde apuntan los rewrites de `/api/*` en Next.js |

## Pruebas

```bash
cd backend
npm test           # vitest + supertest contra pagos_test (Postgres real, se trunca antes de cada test)
```

```bash
cd frontend
npm run build       # valida tipos/compilación de Next.js
```

La suite de backend cubre, entre otras cosas: aritmética de fechas en hora de Bogotá, el flujo
completo de aceptación (registro → tarjeta → servicios → tick del programador → aprobación →
desembolso, sin doble cobro), reintentos hasta `FAILED`, aislamiento de datos entre usuarios, el
cálculo correcto de comisión/total para servicios de monto fijo, y que un servicio nunca genere ni
cobre automáticamente un periodo ya vencido (al crearlo, al reanudarlo, o si el programador estuvo
mucho tiempo sin correr).

## Roadmap a producto

Este MVP resuelve el flujo feliz de cobro + desembolso manual. Para ser un producto real en
Colombia falta, en orden aproximado de prioridad:

1. **Integraciones de recaudo / agregadores por facturador** (reemplazar el desembolso manual):
   APIs de EPM/Enel-Codensa/Claro/Movistar/etc., o un agregador de recaudo (p. ej. PSE/Corresponsal
   bancario vía un tercero) que permita pagar facturas programáticamente y confirmar el pago sin
   intervención humana.
2. **Regulación colombiana de recaudo por cuenta de terceros**: mover dinero de un cliente a un
   tercero (el facturador) como intermediario está regulado por la Superintendencia Financiera
   (contratos de recaudo, cuentas de manejo separadas, reporte). Antes de operar con volumen real
   se necesita asesoría legal/financiera específica y, probablemente, un convenio con una entidad
   vigilada o un agregador ya autorizado, en vez de mover el dinero directamente.
3. **PCI-DSS**: hoy la tokenización con Wompi ocurre en el navegador del cliente y el backend solo
   guarda el token cifrado (nunca PAN/CVV), lo que reduce el alcance a un **SAQ-A** (el más simple).
   Falta completar el cuestionario formal, escaneos de vulnerabilidad si aplica, y las políticas de
   seguridad de la información que exige el programa de cumplimiento de la pasarela.
4. **KYC / SARLAFT**: para operar como intermediario de pagos en Colombia se requiere verificación
   de identidad de los usuarios (KYC) y un programa de prevención de lavado de activos y
   financiación del terrorismo (SARLAFT) — hoy el registro es solo email/contraseña, sin ninguna
   verificación.
5. **Facturación electrónica de la comisión**: `FEE_PERCENT`/`FEE_FIXED_COP` ya calculan la
   comisión del producto, pero no se emite factura electrónica (DIAN) por ese ingreso — necesario
   para operar formalmente.
6. **Multi-tarjeta / tarjeta de respaldo**: hoy un usuario puede tener varias tarjetas pero cada
   servicio usa una sola (`paymentMethodId` o la tarjeta default); falta un mecanismo de
   "tarjeta de respaldo" automático si la principal falla o vence.
7. **App móvil**: hoy solo hay frontend web responsive (Next.js). Notificaciones push y una
   experiencia nativa (o PWA instalable) están fuera de alcance de este MVP.
8. **Notificaciones por WhatsApp**: hoy las notificaciones son in-app + email opcional (SMTP);
   WhatsApp Business API sería el canal de mayor alcance para recordatorios y confirmaciones en
   Colombia.
9. Otros pendientes menores: flujo de "olvidé mi contraseña", 2FA, rate limiting más fino por
   usuario/IP, webhooks de confirmación asíncrona de Wompi (hoy el cobro es síncrono en la llamada
   `charge`), panel de auditoría con búsqueda/filtros sobre `AuditLog`.

## Limitaciones actuales (honestas)

- **Desembolso 100% manual**: no hay integración real con ningún facturador; un humano debe pagar
  y registrar el comprobante para cada pago cobrado.
- **Sin KYC/SARLAFT ni marco legal de recaudo por cuenta de terceros**: no apto para mover dinero
  real de terceros en Colombia sin resolver esto primero (ver Roadmap, puntos 1-2).
- **Consulta de factura variable es simulada**: `BillerProvider.fetchBill` devuelve un monto
  determinístico en un rango, no consulta al facturador real.
- **Sin verificación de identidad ni 2FA**: el registro es solo email + contraseña.
- **Sin recuperación de contraseña por email** desde la UI (ver sección de admin arriba para el
  camino soportado hoy).
- **Cobro síncrono**: `gateway.charge` se asume síncrono (se espera la respuesta en la misma
  llamada); un flujo con confirmación asíncrona (webhook) de Wompi no está implementado.
- **Sin pruebas end-to-end automatizadas en CI**: la suite de backend (`vitest`) corre contra una
  base de datos Postgres real local; no hay pipeline de CI configurado en este repo todavía.
- **Un solo idioma/mercado**: todo el texto está en español (es-CO) y los montos en COP; no hay
  soporte multi-moneda ni internacionalización.
