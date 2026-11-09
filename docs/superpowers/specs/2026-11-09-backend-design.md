# Backend de EcoEstudiante: diseño

- **Fecha:** 2026-11-09
- **Estado:** aprobado en conversación, pendiente de revisión escrita
- **Alcance:** servidor propio para la app Android (Capacitor) y la web (PWA) de EcoEstudiante

## 1. Objetivo y contexto

EcoEstudiante es hoy un prototipo **sin servidor**: todo el estado vive en `localStorage` (`src/lib/store.ts`) y los
demás estudiantes son simulados en el propio dispositivo. El objetivo es construir un **backend propio** para que la app
funcione con datos reales compartidos entre varias personas.

### Lo que se decidió

| Tema | Decisión |
|---|---|
| Para qué es | Entrega académica: demo y sustentación del curso, pocos usuarios reales (compañeros y docente), **costo cero** |
| Qué espera el curso | Backend **propio**: API REST y base de datos diseñadas por el autor, que pueda explicar |
| Lenguaje | **Node.js + TypeScript** |
| Framework y acceso a datos | **Express + Prisma** sobre **PostgreSQL** |
| Dónde corre | **Local** durante el desarrollo y **desplegado** en internet al final (la URL es configurable) |
| Funciones reales | Las cinco: correo de verificación real, fotos en el servidor, chat en tiempo real, push con la app cerrada y estudiantes simulados en el servidor |

### Criterios de éxito

1. Dos personas con dos celulares distintos ven las mismas publicaciones, chatean entre sí en tiempo real, acuerdan una
   entrega y se dejan una reseña.
2. El registro solo acepta correos `@upsjb.edu.pe` y el código de verificación llega de verdad a ese correo.
3. Con la app cerrada, el celular recibe una notificación push cuando llega un mensaje.
4. Los estudiantes simulados siguen respondiendo, confirmando entregas e interesándose en lo publicado.
5. El servidor está desplegado gratis en internet y el APK 2.0 apunta a él.
6. Las reglas de permisos están cubiertas por pruebas automáticas que pasan.

### Fuera de alcance

Panel de moderación (los reportes solo se guardan), pagos, refresh tokens, recuperación de contraseña, varias sedes
o universidades y escalado horizontal (un solo proceso de servidor).

## 2. Arquitectura

```
 Celular (APK) / Navegador (PWA)
        │  HTTPS (REST + JSON)        │  WebSocket (Socket.IO)
        ▼                             ▼
 ┌─────────────────── server/ (Node + TS) ───────────────────┐
 │  Express: rutas → validación (zod) → servicio → Prisma     │
 │  Socket.IO: chat y avisos en vivo (mismo proceso)          │
 │  Worker de bots: revisa tareas programadas cada 5 s        │
 └───────┬───────────────┬───────────────┬───────────────┬───┘
         ▼               ▼               ▼               ▼
   PostgreSQL       Cloudinary      Resend/SMTP     Firebase (FCM)
   (local/Neon)     (fotos)         (códigos)       (push)
```

### Estructura de carpetas

```
server/
  package.json                ← independiente del frontend (npm)
  .env.example                ← documenta todas las variables
  scripts/db.ts               ← PostgreSQL embebido (embedded-postgres) para desarrollo
  prisma/
    schema.prisma             ← diseño de la base de datos
    migrations/               ← SQL generado por Prisma
    seed.ts                   ← bots, sus materiales y reseñas (desde los datos de ejemplo)
  src/
    index.ts                  ← arranca HTTP + Socket.IO + worker de bots
    app.ts                    ← Express: CORS, JSON, rate limit, rutas, manejador de errores
    config.ts                 ← lee y valida las variables de entorno con zod
    db.ts                     ← instancia única de PrismaClient
    errors.ts                 ← clase AppError(status, code, message)
    middleware/auth.ts        ← verifica el JWT y deja req.user
    modules/
      auth/  users/  materials/  uploads/  saved/  conversations/
      agreements/  notifications/  reports/
        routes.ts             ← define endpoints y valida con zod
        service.ts            ← lógica y reglas de negocio
        schemas.ts            ← esquemas zod de entrada
    notify/notify.ts          ← punto único para avisar a un usuario
    realtime/socket.ts        ← Socket.IO: autenticación, salas, emitir eventos
    bots/
      worker.ts               ← bucle que ejecuta BotJob vencidos
      replies.ts              ← respuestas automáticas (simulatedReply y buyerReply actuales)
    integrations/
      mail.ts                 ← Resend/SMTP, o consola en modo local
      images.ts               ← Cloudinary, o disco (server/uploads/) en modo local
      push.ts                 ← Firebase Admin, o nada en modo local
  test/                       ← Vitest + Supertest
shared/
  constants.ts                ← carreras, cursos, puntos seguros, motivos de reporte (usados por app y servidor)
```

### Principios

- **Una responsabilidad por unidad.** Las rutas solo reciben y validan; la lógica vive en `service.ts`, que se prueba
  sin HTTP. Los servicios no conocen Express.
- **Integraciones con modo local.** Cada integración externa se activa solo si su clave está en el `.env`. Sin claves,
  el sistema funciona completo en la laptop: el código se imprime en consola, las fotos van a disco y el push se omite.
- **El servidor es la única fuente de verdad.** Toda regla de permisos y de estado se valida en el servidor.
- **Separado del frontend.** `server/` tiene su propio `package.json` para no alterar la configuración de Vite y Figma Make.

## 3. Modelo de datos

PostgreSQL, definido en `prisma/schema.prisma`. Los ids son `cuid()` y las fechas, `DateTime` con valor por defecto
`now()`.

### Enums

| Enum | Valores |
|---|---|
| `Mode` | `Venta`, `Intercambio`, `Donacion` (se muestra "Donación") |
| `Category` | `Libros`, `Apuntes`, `Calculadoras`, `Separatas` |
| `Condition` | `ComoNuevo`, `BuenEstado`, `Usado` |
| `MaterialStatus` | `Disponible`, `Reservado`, `Entregado`, `Pausado`, `Eliminado` |
| `AgreementStatus` | `Pendiente`, `Confirmado`, `Completado`, `Cancelado` |
| `BotJobKind` | `reply`, `confirm_agreement`, `buyer_interest` |
| `NotificationCategory` | `mensajes`, `acuerdos`, `busquedas`, `cuenta` |

La API expone los textos con tilde y espacios que ya usa la app (`'Donación'`, `'Como nuevo'`); la conversión entre
enum y texto ocurre en una sola función por enum.

### Tablas

**User**: `id`, `name`, `email` (único, en minúsculas), `career`, `cycle` (1–10), `passwordHash` (bcrypt, costo 10),
`verified` (bool), `isBot` (bool), `notificationPrefs` (JSON, ver §5.2), `createdAt`.

**EmailCode**: `id`, `userId` → User, `codeHash` (SHA-256 del código de 6 dígitos), `expiresAt` (+15 min),
`attempts` (máx. 5), `createdAt`. Al pedir un código nuevo se borran los anteriores del usuario.

**Material**: `id`, `ownerId` → User, `title`, `course`, `career`, `cycle`, `category`, `mode`, `price` (entero en
soles; 0 si no es venta), `exchangeFor?`, `condition`, `description`, `status`, `createdAt`, `updatedAt`.
Índices: `(status, createdAt)`, `ownerId`.

**MaterialImage**: `id`, `materialId` → Material (cascade), `url`, `publicId` (para borrar en Cloudinary o disco),
`position`. Máximo 5 por material.

**SavedMaterial**: PK compuesta `(userId, materialId)`, `createdAt`. Cascade en ambos lados.

**SavedSearch**: `id`, `userId` → User, `query`, `category` (`'Todos'` o una categoría), `mode` (`'Todos'` o una
modalidad), `createdAt`.

**Report**: `id`, `materialId` → Material (cascade), `userId` → User, `reason`, `detail`, `createdAt`.

**Conversation**: `id`, `materialId` → Material, `buyerId` → User, `sellerId` → User, `buyerReadAt?`, `sellerReadAt?`,
`lastMessageAt`, `createdAt`. **UNIQUE `(materialId, buyerId)`**: una sola conversación por material y comprador.

**Message**: `id`, `conversationId` → Conversation (cascade), `senderId` → User, `text` (1–1000 caracteres),
`createdAt`. Índice `(conversationId, createdAt)`.

**Agreement**: `id`, `materialId` → Material, `buyerId`, `sellerId`, `place` (uno de los puntos seguros), `date`
(`YYYY-MM-DD`), `time` (`HH:mm`), `note?`, `status`, `createdAt`, `updatedAt`.

**Review**: `id`, `agreementId?` (único; nulo solo en reseñas sembradas), `authorId?` → User (nulo solo en reseñas
sembradas, cuyos autores no son usuarios), `authorName` (copiado del autor al crear la reseña), `targetId` → User,
`stars` (1–5), `comment`, `materialTitle` (para mostrarlo aunque el material ya no exista), `createdAt`.
La reputación de un usuario es `AVG(stars)` y `COUNT(*)` de las reseñas con `targetId` = usuario, redondeada a un
decimal. Reemplaza a `baseRating` y `baseRatingCount`.

**Notification**: `id`, `userId` → User, `category`, `text`, `link` (ruta con `#`, como hoy), `read`, `createdAt`.

**DeviceToken**: `token` (PK), `userId` → User, `platform` (`android` o `web`), `updatedAt`.

**BotJob**: `id`, `kind`, `payload` (JSON), `dueAt`, `doneAt?`, `createdAt`. Índice `(doneAt, dueAt)`.

### Borrado de materiales

`DELETE /materials/:id` borra físicamente el material (con cascada a imágenes, guardados y reportes) **solo si no
tiene conversaciones ni acuerdos**. Si los tiene, pasa a `status = Eliminado`: deja de aparecer en búsquedas y
perfiles, pero el chat y las reseñas siguen legibles. En ambos casos se borran las fotos del almacenamiento y se
cancelan sus acuerdos `Pendiente` o `Confirmado`.

## 4. API REST

Base: `/api`. Formato JSON. 🔒 = requiere `Authorization: Bearer <token>`.

### 4.1 Autenticación

- Contraseñas con **bcrypt**. Mínimo 8 caracteres.
- Al verificar o iniciar sesión se devuelve `{ token, user }`. El token es un **JWT HS256** con `sub = userId`, válido
  **7 días**, firmado con `JWT_SECRET`.
- Solo cuentas `verified` pueden iniciar sesión. Si una cuenta no verificada intenta entrar, se responde 403
  `EMAIL_NOT_VERIFIED` con su `userId` y se envía un código nuevo.
- **Rate limit** en `/auth/*`: 10 peticiones por minuto por IP. Reenvío de código: 1 cada 60 s por usuario.
- Si alguien se registra con un correo que existe pero **no está verificado**, se actualizan sus datos y se reenvía
  el código (como hoy). Si ya está verificado: 409 `EMAIL_TAKEN`.

### 4.2 Endpoints

| Método y ruta | Descripción |
|---|---|
| `POST /auth/register` | `{name, email, career, cycle, password}` → crea usuario no verificado y envía el código. Responde `{userId}` |
| `POST /auth/verify` | `{userId, code}` → verifica y responde `{token, user}`. Crea la notificación de bienvenida |
| `POST /auth/resend-code` | `{userId}` → nuevo código |
| `POST /auth/login` | `{email, password}` → `{token, user}` |
| `GET /auth/me` 🔒 | Usuario actual con sus `notificationPrefs` |
| `PATCH /users/me` 🔒 | `{name?, career?, cycle?, notificationPrefs?}` |
| `GET /users/:id` | Perfil público: nombre, carrera, ciclo, reputación, reseñas recibidas y materiales disponibles |
| `GET /materials` | Filtros: `q`, `category`, `mode`, `career`, `cycle`, `condition`, `maxPrice`, `page` (20 por página). Solo `Disponible` y `Reservado`. `q` busca en título, curso y categoría sin distinguir mayúsculas |
| `GET /materials/:id` | Detalle con fotos, dueño y su reputación. Un material `Pausado` o `Eliminado` solo lo ve su dueño (o participantes de sus conversaciones, para `Eliminado`) |
| `POST /materials` 🔒 | Crea con `images: [{url, publicId}]`. Programa un `buyer_interest` y avisa a las búsquedas guardadas que coincidan |
| `PATCH /materials/:id` 🔒 | Edita (solo el dueño) |
| `PATCH /materials/:id/status` 🔒 | `Disponible` ↔ `Pausado` (solo el dueño; `Reservado` y `Entregado` los fija el flujo de acuerdos) |
| `DELETE /materials/:id` 🔒 | Ver §3, "Borrado de materiales" |
| `GET /users/me/materials` 🔒 | Mis publicaciones en cualquier estado salvo `Eliminado` |
| `POST /uploads` 🔒 | Multipart, campo `files`, máx. 5 archivos JPEG/PNG/WebP de 2 MB → `[{url, publicId}]` |
| `GET /saved` 🔒 · `PUT /saved/:materialId` 🔒 · `DELETE /saved/:materialId` 🔒 | Materiales guardados |
| `GET /saved-searches` 🔒 · `POST /saved-searches` 🔒 · `DELETE /saved-searches/:id` 🔒 | Alertas de búsqueda |
| `GET /conversations` 🔒 | Mis conversaciones con material, otro participante, último mensaje y cantidad de no leídos, ordenadas por `lastMessageAt` |
| `POST /conversations` 🔒 | `{materialId}` → abre o reutiliza la conversación del comprador actual con el dueño |
| `GET /conversations/:id/messages` 🔒 | Mensajes (paginados por `before`, 50 por página) |
| `POST /conversations/:id/messages` 🔒 | `{text}` → guarda, emite `message:new`, avisa al otro y, si el otro es bot, programa `reply` |
| `POST /conversations/:id/read` 🔒 | Marca como leída y emite `conversation:read` |
| `GET /agreements` 🔒 | Mis acuerdos como comprador o vendedor |
| `POST /agreements` 🔒 | `{materialId, place, date, time, note?}`: lo propone el comprador. Publica en el chat el mensaje "📍 Propuesta de entrega…" |
| `POST /agreements/:id/confirm` 🔒 | Vendedor: `Pendiente` → `Confirmado`; el material pasa a `Reservado` |
| `POST /agreements/:id/cancel` 🔒 | Cualquiera de los dos, desde `Pendiente` o `Confirmado`; si el material estaba `Reservado`, vuelve a `Disponible` |
| `POST /agreements/:id/complete` 🔒 | Comprador: `Confirmado` → `Completado`; el material pasa a `Entregado` |
| `POST /agreements/:id/review` 🔒 | Comprador, solo si está `Completado` y aún no tiene reseña: `{stars, comment}` |
| `GET /notifications` 🔒 · `POST /notifications/read-all` 🔒 | Avisos (los 100 más recientes) |
| `POST /devices` 🔒 · `DELETE /devices/:token` 🔒 | Registrar o quitar un token FCM |
| `POST /reports` 🔒 | `{materialId, reason, detail}` |
| `GET /health` | `{ok: true}`, sin base de datos; sirve para "despertar" el servidor |

### 4.3 Reglas de negocio (validadas en el servidor)

1. Solo el dueño edita, pausa o borra su material.
2. Solo comprador y vendedor leen o escriben en su conversación y ven su acuerdo.
3. No se puede abrir conversación ni proponer acuerdo sobre un material propio. Se puede abrir conversación si el
   material está `Disponible` o `Reservado` (para preguntar si se libera), pero solo se puede proponer acuerdo si está
   `Disponible`.
4. Un material admite **un solo acuerdo activo** (`Pendiente` o `Confirmado`) a la vez: si ya hay uno, 409
   `AGREEMENT_ACTIVE`.
5. Transiciones de acuerdo válidas: `Pendiente → Confirmado | Cancelado`, `Confirmado → Completado | Cancelado`.
   Cualquier otra responde 409 `INVALID_TRANSITION`.
6. El lugar debe ser uno de los puntos seguros de `shared/constants.ts`, y la fecha, hoy o posterior (hora de Lima).
7. Precio: entero de 1 a 1000 si es `Venta`; se guarda 0 en `Intercambio` y `Donación`.
8. Correo: debe cumplir `^[a-z0-9._-]+@upsjb\.edu\.pe$`.

### 4.4 Errores

Siempre con este formato, con un mensaje en español que la app muestra tal cual:

```json
{ "error": { "code": "MATERIAL_NOT_FOUND", "message": "Esta publicación ya no existe." } }
```

| HTTP | Cuándo | Ejemplos de `code` |
|---|---|---|
| 400 | Falla la validación zod | `VALIDATION` (incluye `fields` con el error de cada campo) |
| 401 | Falta token, es inválido o venció | `UNAUTHENTICATED` |
| 403 | No tiene permiso o el correo no está verificado | `FORBIDDEN`, `EMAIL_NOT_VERIFIED` |
| 404 | No existe | `MATERIAL_NOT_FOUND`, `CONVERSATION_NOT_FOUND` |
| 409 | Conflicto de estado | `EMAIL_TAKEN`, `AGREEMENT_ACTIVE`, `INVALID_TRANSITION`, `ALREADY_REVIEWED` |
| 413 | Archivo demasiado grande | `FILE_TOO_LARGE` |
| 429 | Demasiados intentos | `RATE_LIMITED`, `TOO_MANY_ATTEMPTS` |
| 500 | Error inesperado | `INTERNAL` (el detalle va solo al log del servidor) |

Las rutas lanzan `AppError`, y un único manejador de errores de Express los convierte en esta respuesta.

## 5. Tiempo real, notificaciones y bots

### 5.1 `notify(userId, { category, text, link })`

Es el único punto que usan los módulos para avisar a alguien:

1. Crea la fila en `Notification`.
2. Si el usuario tiene al menos un socket conectado, emite `notification:new` a la sala `user:<id>`. La app muestra la
   ventana emergente con sonido y vibración que ya existe.
3. Si no tiene sockets conectados, y sus preferencias lo permiten, envía un push FCM a todos sus `DeviceToken`. Los
   tokens que FCM devuelva como no registrados se eliminan.

Si el usuario es un bot, solo se crea la fila (paso 1).

| Evento | Categoría | A quién |
|---|---|---|
| Mensaje nuevo | `mensajes` | Al otro participante |
| Bot interesado en tu material | `mensajes` | Al dueño |
| Acuerdo propuesto, confirmado, cancelado o completado | `acuerdos` | A la otra parte |
| Material nuevo que coincide con tu búsqueda guardada | `busquedas` | Al dueño de la búsqueda |
| Bienvenida al verificar el correo | `cuenta` | Al usuario |

### 5.2 Preferencias de notificación en el servidor

Con la app cerrada, el celular no puede filtrar avisos, así que parte de las preferencias de `src/lib/settings.ts` pasa
a `User.notificationPrefs`:

```json
{ "push": true, "quietNight": false,
  "categories": { "mensajes": true, "acuerdos": true, "busquedas": true, "cuenta": true } }
```

- `push` reemplaza a la opción `system` actual.
- `quietNight`: entre las 22:00 y las 07:00 hora de Lima (`America/Lima`) no se envía push. El aviso igual queda
  guardado en la app.
- Una categoría apagada no envía push **ni** emite `notification:new`, pero la fila se guarda igual.
- Ventana emergente, sonido, vibración, volumen y todas las opciones de accesibilidad siguen guardadas en el
  dispositivo, porque solo afectan a la pantalla.

### 5.3 Socket.IO

- Mismo servidor HTTP y mismo puerto. El cliente se conecta con `auth: { token }`. Si el token es inválido, la conexión
  se rechaza.
- Cada usuario entra a la sala `user:<id>`. La presencia se calcula con `io.in('user:<id>').fetchSockets()`.
- **Los clientes no escriben por el socket**: los mensajes se envían por REST. El socket solo empuja eventos del
  servidor al cliente:

| Evento | Payload |
|---|---|
| `message:new` | `{ conversationId, message }` |
| `conversation:read` | `{ conversationId, userId, readAt }` |
| `agreement:updated` | `{ agreement }` |
| `material:updated` | `{ materialId, status }` (a quienes tienen conversación sobre ese material) |
| `notification:new` | `{ notification }` |

- Al reconectarse, la app vuelve a pedir `/conversations` y `/notifications` para no perder eventos.

### 5.4 Estudiantes simulados

- Son `User` con `isBot = true`, creados por el seed con los nombres, materiales y reseñas de `src/lib/data.ts`. Su
  contraseña es aleatoria y no se puede usar para iniciar sesión.
- `bots/worker.ts` se ejecuta cada 5 s: toma los `BotJob` con `doneAt IS NULL AND dueAt <= now()`, ejecuta cada uno y
  marca `doneAt`. Si un trabajo ya no aplica (material no disponible, acuerdo ya no pendiente), se marca hecho sin
  hacer nada. Los errores se registran y el trabajo se marca hecho para no repetirlo en bucle.
- Los bots llaman a **los mismos servicios** que un usuario (`sendMessage`, `confirmAgreement`, `openConversation`),
  así que mensajes, sockets, notificaciones y push funcionan sin código especial.

| Trabajo | Se programa cuando | Retraso | Qué hace |
|---|---|---|---|
| `reply` | Un usuario escribe en una conversación con un bot | 3–8 s | Si el bot es el vendedor responde con `simulatedReply`; si es el comprador, con `buyerReply` |
| `confirm_agreement` | Un usuario propone un acuerdo a un bot vendedor | 10–20 s | Confirma el acuerdo y escribe "✅ ¡Confirmado! Nos vemos ahí. Llevaré el material." |
| `buyer_interest` | Un usuario real publica un material | 30–60 s | Un bot al azar abre conversación con el mensaje de interés actual (distinto si es donación) |

- `BOTS_ENABLED=false` desactiva el worker y la programación de trabajos.
- Como los trabajos están en la base de datos, se ejecutan al volver si el servidor se reinicia o el hosting lo duerme.

## 6. Cambios en el frontend

- **`src/lib/api.ts` (nuevo):** `request(method, path, body?)` agrega `VITE_API_URL` y el token, parsea el formato de
  error y lanza `ApiError(code, message, status)`. Ante un 401 borra el token y navega a `#/ingresar`.
- **`src/lib/socket.ts` (nuevo):** conexión Socket.IO con el token. Aplica cada evento a la caché del store.
- **`src/lib/store.ts`:** se conserva `useStore` y la forma de `State` como **caché** de lo que devuelve el servidor,
  así las pantallas casi no cambian. Las acciones pasan a ser `async`: llaman a la API, actualizan la caché y, si
  fallan, muestran el mensaje con `toast(..., 'error')`. Se eliminan `hashPassword`, `processScheduled`, `applyEvent`,
  `eventNotice`, `ScheduledEvent`, `resetDemo` y el uso de `createSeedState`. La caché se guarda en `localStorage`
  para mostrar los últimos datos sin conexión.
- **Sesión:** el token se guarda en `localStorage` (clave `ecoestudiante:token`). Al abrir la app se llama a
  `/auth/me`.
- **Fotos:** se mantiene la compresión de `src/lib/images.ts`. Se suben con `POST /uploads` antes de crear o editar el
  material.
- **Pantallas:** se agregan estados de carga en Explore, Detail, Chat, Activity y Profile, y el botón "Publicar" se
  deshabilita mientras sube. `src/lib/data.ts` queda solo con constantes (que se mueven a `shared/constants.ts`).
- **Arranque en frío:** antes de todo se llama a `/health`. Si tarda más de 1,5 s se muestra "Conectando con el
  servidor…" hasta que responda (con reintentos durante 60 s).
- **Sin conexión:** la PWA abre con la caché. Un aviso "Sin conexión" aparece y las acciones que escriben se
  deshabilitan.
- **Notificaciones:** `src/lib/alerts.ts` muestra los avisos que llegan por socket. Se agrega
  `@capacitor/push-notifications`: al iniciar sesión se pide permiso, se registra el token con `POST /devices` y, al
  tocar un push, se abre su `link`. Al cerrar sesión se llama a `DELETE /devices/:token`. Las notificaciones locales
  actuales siguen usándose para los avisos con la app abierta.
- **Ajustes:** la pantalla de ajustes lee y escribe `notificationPrefs` con `PATCH /users/me`.
- **Android:** `google-services.json` del proyecto Firebase en `android/app/` y el plugin de Gradle de Google Services.

## 7. Pruebas

- **Backend:** Vitest + Supertest contra una base de datos `ecoestudiante_test` (PostgreSQL embebido que las pruebas inician solas), con las integraciones en
  modo local. Antes de cada archivo de pruebas se vacían las tablas.
  - Auth: registro → código → verificación → login; código vencido, código incorrecto, 5 intentos, correo que no es
    institucional, correo repetido.
  - Permisos: cada regla de §4.3 tiene al menos una prueba que intenta violarla y espera 403 o 409.
  - Acuerdos: todas las transiciones válidas e inválidas y su efecto en el estado del material.
  - Bots: el worker con reloj simulado (`vi.useFakeTimers` + `dueAt` en el pasado) ejecuta cada tipo de trabajo una
    sola vez.
  - `notify`: con usuario conectado emite por socket y no hace push; sin conexión hace push; respeta categoría y
    horario silencioso (con `push.ts` simulado).
- **Frontend:** verificación en el navegador de cada flujo con dos usuarios a la vez (dos ventanas): registro,
  publicar con fotos, buscar, chatear, acordar, completar y reseñar. Prueba final en un celular real con el APK,
  incluido el push con la app cerrada.

## 8. Entorno y despliegue

### Variables de entorno (`server/.env.example`)

| Variable | Para qué | Si falta |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL | Obligatoria |
| `JWT_SECRET` | Firma de tokens (mín. 32 caracteres) | Obligatoria |
| `PORT` | Puerto HTTP | 3000 |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma | `http://localhost:8443`, `capacitor://localhost`, `https://localhost` |
| `PUBLIC_URL` | URL pública del servidor (para fotos en modo local) | `http://localhost:3000` |
| `RESEND_API_KEY`, `MAIL_FROM` | Envío de correos | El código se imprime en la consola |
| `CLOUDINARY_URL` | Almacenar fotos | Las fotos se guardan en `server/uploads/` |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de la cuenta de servicio (en base64) | No se envía push |
| `BOTS_ENABLED` | Activar estudiantes simulados | `true` |

Si Resend no permite enviar al dominio `upsjb.edu.pe` sin un dominio propio verificado, se usa **Gmail SMTP con
contraseña de aplicación** (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`). `mail.ts` admite ambos y elige según las variables
presentes.

### Local

1. `cd server && npm run db`: PostgreSQL 17 embebido con `embedded-postgres` (paquete de npm, sin Docker ni instalador), puerto 5433. Alternativa: `DATABASE_URL` hacia una base gratuita de Neon.
2. `npm install`, `npx prisma migrate dev`, `npx prisma db seed`, `npm run dev` (tsx en modo watch).
3. En el frontend, `VITE_API_URL=http://localhost:3000` en `.env.local`. Para probar en el celular por Wi-Fi se usa la
   IP de la laptop.

### Producción (costo cero)

- **Base de datos:** Neon, plan gratuito.
- **Servidor:** Render, web service gratuito, conectado a este repositorio de GitHub con *root directory* `server/`.
  - Build: `npm ci && npx prisma generate && npm run build`.
  - Start: `npx prisma migrate deploy && node dist/index.js`.
  - Health check: `/health`.
- **Secretos:** solo como variables de entorno de Render. `.env` y `google-services.json` del servidor nunca van a git.
- **APK 2.0:** se compila con `VITE_API_URL` apuntando a Render y se publica en Releases. Se actualiza el README.
- **Limitación conocida:** Render gratuito duerme el servicio tras 15 min sin uso. La primera petición tarda ~30–50 s,
  y la app lo cubre con la pantalla "Conectando con el servidor…".

## 9. Etapas de construcción

Cada etapa termina con pruebas pasando y la app funcionando de punta a punta para lo que cubre.

1. **Base:** `server/` con Express, Prisma, PostgreSQL embebido, seed, auth completa con correo real y perfiles. `api.ts` en el
   frontend. Pantallas de Auth y Account contra el servidor.
2. **Materiales y fotos:** CRUD de materiales, filtros, `/uploads` con Cloudinary, guardados, búsquedas guardadas y
   reportes. Pantallas Explore, Detail, Publish, Profile y Activity.
3. **Chat y acuerdos:** conversaciones, mensajes, Socket.IO, acuerdos, reseñas, reputación, `notify` (sin push) y
   notificaciones en la app. Pantallas Chat y Agreement.
4. **Bots:** `BotJob`, worker y los tres tipos de trabajo.
5. **Push y despliegue:** Firebase, `DeviceToken`, preferencias en el servidor, ajustes, Neon y Render, APK 2.0 y README.

## 10. Entregable de documentación

Al terminar el diseño se escribe, además de este spec, un **documento explicativo para la sustentación**
(`docs/backend-explicado.md`). Debe explicar, en orden y con detalle: el problema y la solución, la arquitectura, el
modelo de base de datos (con diagrama), cada endpoint, los flujos principales paso a paso (registro, publicar, chatear,
acordar, push y bots), la seguridad, cómo ejecutarlo y desplegarlo, y las decisiones tomadas con sus alternativas.
