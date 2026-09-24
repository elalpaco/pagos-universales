# PAGOS-UNIVERSALES — Diseño v1 (contrato para implementación)

> **Meta:** un cliente registra su tarjeta de crédito y los servicios/suscripciones que quiere pagar;
> el sistema los paga **automáticamente** en la fecha correcta, con límites de seguridad, reintentos,
> notificaciones e historial. Primer usuario: Diego (admin). Debe quedar **listo para rodar** y
> **pensado como producto** (multiusuario, proveedores intercambiables, auditable).

## 1. Modelo de negocio / flujo del dinero

1. **Cobro (pull):** el sistema cobra el monto de la obligación a la tarjeta del cliente vía una
   pasarela (`PaymentGateway`). Colombia → **Wompi** (tokenización de tarjeta + *payment sources*
   para cobros recurrentes sin CVV). Por defecto `simulated` para que todo funcione sin llaves.
2. **Desembolso (push):** el dinero se entrega al facturador (EPM, Claro, Netflix, etc.) vía un
   `PayoutProvider`. v1: `manual` → cola en el panel de operaciones donde un operador paga y registra
   el comprobante (modelo *concierge*). Futuro: agregadores de recaudo (API) por facturador.
3. **Consulta de factura (variable):** `BillerProvider.fetchBill(service)` devuelve el monto del
   periodo. v1: `simulated` (monto determinístico en rango) + ingreso manual por el usuario.
4. **Comisión:** `FEE_PERCENT` (default 0) y `FEE_FIXED_COP` (default 0) configurables — base del producto.

Nunca se almacena PAN ni CVV. Solo token del proveedor (cifrado AES-256-GCM con `ENCRYPTION_KEY`),
marca, últimos 4, vencimiento, titular.

## 2. Stack (se mantiene el del repo)

- Backend: Node 20, Express 4, Prisma 5 + PostgreSQL 16, ESM (`"type":"module"`).
  Libs: `zod`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `helmet`, `express-rate-limit`,
  `node-cron`, `nodemailer` (opcional, si hay SMTP). Tests: `vitest` + `supertest` contra Postgres real
  (`DATABASE_URL_TEST`).
- Frontend: Next.js 14 (pages router, ya existe), React 18, sin framework CSS pesado (CSS propio con
  tokens, modo oscuro). Español (es-CO), montos en COP con `Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})`.
- Montos: **enteros en COP** (`Int`), nunca floats.
- Zona horaria de negocio: `America/Bogota` (`TZ` env). Fechas en DB en UTC.

## 3. Modelo de datos (Prisma)

```
User           id, email(unique), name, passwordHash, role(USER|ADMIN), phone?, notifyEmail(bool, default true),
               monthlyLimitCop(Int?, tope mensual total de autopagos), createdAt, updatedAt
PaymentMethod  id, userId, provider('simulated'|'wompi'), providerTokenEnc, brand, last4, expMonth, expYear,
               holderName, isDefault, status(ACTIVE|EXPIRED|REMOVED), createdAt
Biller         id, name, category, logoEmoji?, amountType(FIXED|VARIABLE), referenceLabel ("Número de contrato"),
               referenceRegex?, payoutProvider('manual'), isActive  -- catálogo sembrado (seed)
Service        id, userId, billerId? , customName?, category, reference(String), amountType(FIXED|VARIABLE),
               fixedAmountCop?, maxAmountCop (tope: si factura > tope ⇒ requiere aprobación),
               frequency(MONTHLY|BIMONTHLY|QUARTERLY|YEARLY|WEEKLY), dueDay(1-31, para mensual+),
               anchorDate (Date: primera fecha de vencimiento; define ciclo),
               payDaysBefore(Int, default 2), paymentMethodId?, (null ⇒ tarjeta default)
               status(ACTIVE|PAUSED|DELETED), nextDueDate(Date), createdAt, updatedAt
Payment        id, userId, serviceId, paymentMethodId, periodKey (ej "2026-10"), dueDate, scheduledFor,
               amountCop, feeCop, totalCop, status (ver §4), attempts, nextAttemptAt?, lastError?,
               gatewayRef?, payoutRef?, payoutReceiptUrl?, idempotencyKey(unique),
               approvedAt?, chargedAt?, paidAt?, createdAt, updatedAt
               @@unique([serviceId, periodKey])   -- nunca pagar dos veces el mismo periodo
Notification   id, userId, type, title, body, readAt?, createdAt
AuditLog       id, userId?, actorId?, action, entity, entityId, data(Json), createdAt
```

## 4. Ciclo de vida de un pago

```
SCHEDULED ──(llega scheduledFor)──► [monto conocido?]
   │                                   ├─ no (VARIABLE) → BillerProvider.fetchBill → monto
   │                                   ├─ monto > maxAmountCop o supera monthlyLimitCop → PENDING_APPROVAL
   │                                   └─ ok → CHARGING
PENDING_APPROVAL ──(usuario aprueba)──► CHARGING   | (usuario rechaza/omite) → SKIPPED
CHARGING ── gateway.charge ok ──► CHARGED ──► payout.enqueue ──► DISBURSING
         └─ falla ──► attempts++ ; si attempts<3 → SCHEDULED con nextAttemptAt (+1h, +6h) ; si no → FAILED
DISBURSING ──(operador marca pagado con referencia / API confirma)──► PAID
DISBURSING ──(operador marca fallido)──► REFUND_PENDING → REFUNDED (gateway.refund)
```
- Cada transición: `AuditLog` + `Notification` al usuario (y email si SMTP configurado).
- Idempotencia: `idempotencyKey = sha256(serviceId:periodKey:attempt)` enviado al gateway; la
  transición a CHARGING se hace con `updateMany where status=SCHEDULED` (lock optimista) para que dos
  workers nunca cobren doble.
- Tarjeta vencida o sin tarjeta → FAILED inmediato con mensaje claro.

## 5. Motor de programación (`scheduler`)

`runTick(now)` — función pura sobre DB, ejecutada por `node-cron` cada `SCHEDULER_CRON`
(default `*/5 * * * *`) y expuesta a admin como `POST /api/admin/scheduler/run` (y usable en tests):
1. **Planificar:** para cada Service ACTIVE, asegurar que existe Payment del próximo periodo
   (`nextDueDate`), `scheduledFor = dueDate - payDaysBefore` (a las 08:00 Bogotá). Al crear, avanzar
   `nextDueDate` según frecuencia (fin de mes correcto: dueDay 31 en febrero ⇒ último día).
2. **Ejecutar:** Payments SCHEDULED con `scheduledFor<=now` y (`nextAttemptAt` null o `<=now`).
3. **Recordatorios:** notificación 3 días antes de cada cobro programado (una vez).
4. **Vencimientos de tarjeta:** marcar EXPIRED y notificar.
`SCHEDULER_ENABLED=false` desactiva el cron (tests).

## 6. Proveedores (interfaces en `backend/src/providers/`)

```js
// gateway: { name, tokenize?(cardData) /*solo simulated*/, createPaymentSource({token, user}) -> {providerToken, brand,last4,expMonth,expYear},
//            charge({providerToken, amountCop, reference, idempotencyKey, user}) -> {ok, gatewayRef, error?},
//            refund({gatewayRef, amountCop}) -> {ok} }
// simulated: tarjeta "4111111111111111" aprueba; "4000000000000002" declina; "4000000000009995" fondos insuficientes;
//            cualquier otra con Luhn válido aprueba. Frontend en modo simulado envía el número al endpoint
//            /api/payment-methods/simulated (el backend solo guarda last4/brand, jamás el PAN).
// wompi: frontend tokeniza DIRECTO contra Wompi (POST {WOMPI_API}/tokens/cards con llave pública) y envía
//        solo el token; backend obtiene acceptance_token, crea payment_source (CARD) y cobra con
//        POST /transactions {payment_source_id, amount_in_cents, currency:'COP', reference, customer_email,
//        signature:{integrity}, recurrent:true}. Consulta estado hasta APPROVED/DECLINED (poll corto).
// billers: simulated.fetchBill(service, periodKey) -> {amountCop, dueDate}
// payouts: manual.enqueue(payment) -> DISBURSING (aparece en panel ops)
```
Selección por env: `PAYMENT_GATEWAY=simulated|wompi`, `WOMPI_ENV=sandbox|production`,
`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`. `GET /api/config` expone al front
`{gateway, wompiPublicKey?, wompiApiUrl?}`.

## 7. API REST (prefijo `/api`, JSON, auth por cookie httpOnly `pu_token` JWT 7d; también `Authorization: Bearer`)

Errores: `{ error: { code, message, details? } }` con códigos HTTP correctos. Validación zod.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /health | `{status, db}` (sin /api también) |
| GET | /api/config | gateway info pública |
| POST | /api/auth/register | {email,password(min 8),name} → user (rate-limited). Registro abierto controlado por `ALLOW_SIGNUP` (default true) |
| POST | /api/auth/login | {email,password} → set cookie + `{user, token}` |
| POST | /api/auth/logout | |
| GET | /api/me · PATCH /api/me | perfil, `monthlyLimitCop`, `notifyEmail`, `phone` |
| GET | /api/dashboard | `{upcoming[≤10], pendingApproval[], monthTotalCop, monthPaidCop, activeServices, failedCount, nextCharge}` |
| GET/POST | /api/payment-methods | listar / (wompi) crear desde `{token}` |
| POST | /api/payment-methods/simulated | `{number, expMonth, expYear, cvc, holderName}` (solo si gateway=simulated) |
| PATCH | /api/payment-methods/:id/default | |
| DELETE | /api/payment-methods/:id | soft-remove; si servicios la usan → pasan a default o se notifica |
| GET | /api/billers | catálogo (`?q=&category=`) |
| GET/POST | /api/services | CRUD |
| GET/PATCH/DELETE | /api/services/:id | |
| POST | /api/services/:id/pause · /resume | |
| POST | /api/services/:id/pay-now | crea/ejecuta pago del periodo actual inmediatamente |
| GET | /api/payments | `?status=&serviceId=&page=` historial |
| GET | /api/payments/:id | detalle + timeline (AuditLog) |
| POST | /api/payments/:id/approve · /skip · /retry | |
| PATCH | /api/payments/:id/amount | fija monto de variable antes del cobro |
| GET | /api/notifications · POST /api/notifications/read-all | |
| **Admin** (role ADMIN) | | |
| GET | /api/admin/overview | métricas: usuarios, servicios, cobrado mes, comisiones, fallidos |
| GET | /api/admin/payouts | cola DISBURSING |
| POST | /api/admin/payouts/:id/complete | `{payoutRef, receiptUrl?}` → PAID |
| POST | /api/admin/payouts/:id/fail | `{reason}` → refund |
| POST | /api/admin/scheduler/run | ejecuta `runTick` ya |
| GET | /api/admin/users | |

## 8. Semilla / primer usuario

`npm run seed` (y automático al arrancar en docker): crea catálogo de Billers colombianos + globales
(EPM Energía/Agua/Gas, Enel-Codensa, Vanti, Acueducto Bogotá, Claro, Movistar, Tigo, ETB, DirecTV,
Netflix, Spotify, Disney+, YouTube Premium, Amazon Prime, Apple iCloud, Google One, Microsoft 365,
ChatGPT/Claude, Smart Fit, Bodytech, Administración conjunto, Seguro vehículo, Colsanitas/prepagada,
Crédito hipotecario, Impuesto predial, Otro) y el usuario admin desde `ADMIN_EMAIL` / `ADMIN_PASSWORD` /
`ADMIN_NAME` (default `diego@pelletier.com.co`, nombre "Diego"). Idempotente (upsert).

## 9. Frontend (páginas)

`/login`, `/registro`, `/` (dashboard), `/servicios` (lista + alta con buscador de catálogo en pasos:
elegir servicio → referencia/monto/frecuencia/día → tarjeta → confirmar), `/servicios/[id]`,
`/tarjetas` (agregar: modo simulado muestra tarjetas de prueba; modo wompi tokeniza en cliente),
`/pagos` (historial con filtros + detalle con línea de tiempo), `/aprobaciones` (pagos que requieren
acción), `/notificaciones`, `/perfil` (límite mensual, email), `/admin` (métricas, cola de desembolsos,
correr scheduler, usuarios). Layout con navegación lateral (móvil: barra inferior), responsive, dark mode.
API via `/api/*` usando **rewrites de Next** hacia `BACKEND_URL` (mismo origen ⇒ la cookie funciona).
Estados vacíos útiles, loaders, errores legibles. Badges de estado con colores consistentes.

## 10. Operación

- `docker compose up --build` levanta db + backend (migra + seed) + frontend en :3000.
- `.env.example` documentado. `JWT_SECRET` y `ENCRYPTION_KEY` obligatorios en producción (fallar al
  arrancar si `NODE_ENV=production` y faltan).
- `scripts/dev.sh` para correr sin Docker (Postgres local).
- README en español: qué es, cómo correr, cómo activar Wompi real, flujo de desembolso, roadmap a producto.

## 11. Criterios de aceptación (los verifica el agente verificador)

1. `npm test` en backend pasa (unitarias de fechas/frecuencias, máquina de estados, e2e API).
2. E2E: registrar → login → agregar tarjeta de prueba → crear servicio fijo (Netflix 44.900 mensual)
   y variable (EPM con tope) → `scheduler/run` con fecha simulada → pago fijo queda DISBURSING
   (cobrado), variable sobre tope queda PENDING_APPROVAL → aprobar → admin completa desembolso → PAID
   → notificaciones creadas → no hay doble cobro al correr el tick dos veces.
3. Tarjeta que declina → reintentos → FAILED + notificación.
4. Frontend compila (`next build`) y las páginas cargan contra el backend real.
5. No hay PAN/CVV en DB ni en logs. Rutas de usuario aisladas (un usuario no ve datos de otro).
6. Diego puede iniciar sesión como ADMIN tras el seed.
