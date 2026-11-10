# Backend EcoEstudiante, Etapa 1 (Base): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servidor propio en `server/` con base de datos PostgreSQL completa, datos sembrados, autenticación con
correo institucional real y perfiles, y la app iniciando sesión contra él.

**Architecture:** Express 5 + Prisma 6 sobre PostgreSQL, organizado en módulos `routes → service → Prisma`.
`createApp(config)` construye la app sin escuchar puertos, para que las pruebas la usen con Supertest. En local y en
pruebas, PostgreSQL corre con `embedded-postgres` (sin Docker). El frontend reemplaza sus funciones de auth locales por
llamadas a la API y deja el resto del estado local hasta las etapas 2 y 3.

**Tech Stack:** Node 22+, TypeScript, Express 5, Prisma 6, PostgreSQL 17 (`embedded-postgres`), zod 4, bcryptjs,
jsonwebtoken, express-rate-limit, nodemailer (SMTP) / Resend (HTTP), Vitest + Supertest, tsx (desarrollo), tsup (build).

**Spec:** `docs/superpowers/specs/2026-11-09-backend-design.md` (§2, §3, §4.1, §4.2 auth y usuarios, §4.4, §6 sesión
y arranque, §8)

## Global Constraints

- `server/` usa **npm** (`server/package.json` + `package-lock.json`), `"type": "module"`. No toca el `package.json` raíz salvo lo indicado.
- Imports sin extensión: el servidor se ejecuta con `tsx` en desarrollo y se empaqueta con `tsup` (`dist/index.js`).
- Todo mensaje de error visible al usuario va **en español**, con el formato `{ "error": { "code", "message", ...details } }`.
- Correo institucional: `/^[a-z0-9._-]+@upsjb\.edu\.pe$/i`, guardado siempre con `trim().toLowerCase()`.
- Contraseña: mínimo **8** caracteres, hash con `bcryptjs` costo **10**.
- JWT HS256, `sub = userId`, expiración **7d**, `JWT_SECRET` de mínimo 32 caracteres.
- Código de verificación: 6 dígitos, guardado como SHA-256 hex, vence en **15 min**, máximo **5** intentos, reenvío como máximo **1 cada 60 s** por usuario.
- Rate limit de `/api/auth/*`: **10 peticiones por minuto por IP** (configurable vía `config.authRateLimit`).
- Ids de los bots y materiales sembrados se conservan (`u-maria`, `m-1`…) para que la app siga funcionando en modo mixto durante la etapa 1.
- `server/.env`, `server/.pg-data/` y `server/uploads/` nunca se commitean.

## Review Focus

1. **Correo con mayúsculas o espacios** (`" Ana.Torres@UPSJB.edu.pe "`): se registra e inicia sesión igual que en minúsculas. La prueba va en la Task 5.
2. **Cuerpo que no es JSON o con campos de más o de menos**: responde 400 `VALIDATION`, nunca 500. La prueba va en la Task 1 (JSON roto) y en la Task 5 (campos).
3. **Token mal formado, vencido o de un usuario que ya no existe**: responde 401 `UNAUTHENTICATED`, nunca 500. La prueba va en la Task 6.
4. **El código correcto después de 5 intentos fallidos**: sigue rechazado (429 `TOO_MANY_ATTEMPTS`) hasta pedir uno nuevo. La prueba va en la Task 5.
5. **Servidor apagado o dormido cuando se abre la app**: la app muestra "Conectando con el servidor…" y luego un mensaje en español, nunca una pantalla en blanco. Se verifica a mano en la Task 9.

---

## Mapa de archivos

```
server/
  package.json, tsconfig.json, vitest.config.ts, tsup.config.ts, .env.example, README.md
  scripts/db.ts                  ← PostgreSQL embebido para desarrollo (puerto 5433)
  prisma/schema.prisma           ← las 14 tablas del spec §3 (completas desde ya)
  prisma/seed.ts                 ← bots, materiales y reseñas desde shared/seed-data.ts
  src/index.ts                   ← loadConfig + createApp + listen
  src/app.ts                     ← createApp(config, deps?)
  src/config.ts                  ← loadConfig(env): Config
  src/errors.ts                  ← AppError + errorHandler
  src/db.ts                      ← prisma (instancia única)
  src/validate.ts                ← body(schema) middleware zod
  src/middleware/auth.ts         ← requireAuth
  src/integrations/mail.ts       ← createMailer(config): Mailer
  src/modules/auth/{routes,service,schemas,tokens}.ts
  src/modules/users/{routes,service,schemas,dto}.ts
  test/global-setup.ts           ← PostgreSQL embebido de pruebas (puerto 5434) + migrate deploy
  test/helpers.ts                ← resetDb(), makeApp(), registerAndVerify()
  test/*.test.ts
shared/
  constants.ts                   ← MODES, CATEGORIES, CONDITIONS, CAREERS, CYCLES, COURSES, SAFE_POINTS, REPORT_REASONS, COMMUNITY_RULES, INSTITUTIONAL_EMAIL
  seed-data.ts                   ← SEED_USERS, SEED_MATERIALS, SEED_REVIEWS
src/lib/api.ts                   ← cliente HTTP del frontend (nuevo)
src/lib/data.ts, src/lib/store.ts, src/screens/Auth.tsx, src/screens/Account.tsx, src/App.tsx, src/vite-env.d.ts, tsconfig.json, .gitignore
```

---

### Task 1: Esqueleto del servidor, configuración y errores

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/tsup.config.ts`, `server/.env.example`, `server/src/config.ts`, `server/src/errors.ts`, `server/src/validate.ts`, `server/src/app.ts`, `server/src/index.ts`
- Modify: `.gitignore`
- Test: `server/test/app.test.ts`

**Interfaces:**
- Produces:
  - `type Config = { port: number; databaseUrl: string; jwtSecret: string; corsOrigins: string[]; publicUrl: string; authRateLimit: number; mail: { resendApiKey?: string; smtp?: { host: string; port: number; user: string; pass: string }; from: string }; botsEnabled: boolean }`
  - `loadConfig(env: NodeJS.ProcessEnv): Config`: valida con zod; lanza `Error` con la lista de variables inválidas.
  - `class AppError extends Error { constructor(status: number, code: string, message: string, details?: Record<string, unknown>) }`
  - `errorHandler: express.ErrorRequestHandler`
  - `body<T>(schema: z.ZodType<T>): express.RequestHandler`: valida `req.body`, lo reemplaza por el valor parseado y, si falla, lanza `AppError(400, 'VALIDATION', 'Revisa los datos enviados.', { fields: Record<string, string> })`.
  - `createApp(config: Config, deps?: Partial<AppDeps>): express.Express`, con `AppDeps = { mailer: Mailer }` (el tipo `Mailer` se define en la Task 4; hasta entonces `AppDeps = {}`).

- [ ] **Step 1: Crear `server/package.json`.** Scripts: `"dev": "tsx watch src/index.ts"`, `"db": "tsx scripts/db.ts"`, `"build": "tsup"`, `"start": "node dist/index.js"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`. Agregar `"prisma": { "seed": "tsx prisma/seed.ts" }`. Instalar:

```bash
cd server
npm i express@5 zod@4 @prisma/client@6 bcryptjs jsonwebtoken express-rate-limit cors nodemailer dotenv
npm i -D typescript tsx tsup vitest supertest prisma@6 embedded-postgres @types/express @types/cors @types/jsonwebtoken @types/nodemailer @types/supertest @types/node
```

- [ ] **Step 2: Configurar TypeScript, tsup y Vitest.**
  - `tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution bundler`, `strict`, `noEmit`, `include: ["src", "test", "scripts", "prisma", "../shared"]`.
  - `tsup.config.ts`: entry `src/index.ts`, format `esm`, `platform: node`, `target: node22`, external `@prisma/client`.
  - `vitest.config.ts`: `globalSetup: './test/global-setup.ts'` (la Task 2 lo crea; mientras tanto, un archivo vacío que exporta `setup` y `teardown` sin hacer nada), `fileParallelism: false`, `testTimeout: 20000`.

- [ ] **Step 3: Escribir `server/.env.example`** con cada variable del spec §8 comentada en español, más `AUTH_RATE_LIMIT=10`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM="EcoEstudiante <no-reply@ecoestudiante.app>"` y `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ecoestudiante`.

- [ ] **Step 4: Escribir la prueba que falla** en `test/app.test.ts`:

```ts
const app = createApp(testConfig())   // testConfig() vive en test/helpers.ts (ver Task 2); por ahora en este archivo
it('GET /api/health responde ok', async () => {
  const res = await request(app).get('/api/health')
  expect(res.status).toBe(200); expect(res.body).toEqual({ ok: true })
})
it('ruta inexistente responde 404 NOT_FOUND en español', async () => {
  const res = await request(app).get('/api/nada')
  expect(res.status).toBe(404)
  expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'No encontramos lo que buscas.' })
})
it('JSON mal formado responde 400 VALIDATION', async () => {
  const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{malo')
  expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION')
})
it('loadConfig rechaza JWT_SECRET corto', () => {
  expect(() => loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/)
})
```

- [ ] **Step 5: Ejecutar** `npm test`. Esperado: FAIL (no existe `createApp`).

- [ ] **Step 6: Implementar** `config.ts`, `errors.ts`, `validate.ts`, `app.ts` e `index.ts`.
  - En `app.ts`, en este orden: `cors({ origin: config.corsOrigins })`, `express.json({ limit: '100kb' })`, `GET /api/health`, routers (vacío por ahora), 404 y `errorHandler`.
  - `errorHandler` traduce a `AppError` el `SyntaxError` de `express.json` (→ 400 `VALIDATION`). Cualquier otro error desconocido responde 500 `INTERNAL` con el mensaje `'Ocurrió un error inesperado. Inténtalo de nuevo.'` y hace `console.error`.
  - `index.ts` carga `dotenv/config`, llama `loadConfig(process.env)` y escucha en `config.port`.

- [ ] **Step 7: Ejecutar** `npm test` y `npm run typecheck`. Esperado: 4 pruebas en PASS y sin errores de tipos.

- [ ] **Step 8: Agregar a `.gitignore`** `server/.pg-data/` y `server/uploads/` (`.env*` ya está). Commit:

```bash
git add server .gitignore
git commit -m "Servidor: esqueleto Express con configuración, errores y health"
```

---

### Task 2: Base de datos (schema completo, PostgreSQL embebido y helpers de prueba)

**Files:**
- Create: `server/prisma/schema.prisma`, `server/prisma/migrations/*` (generado), `server/src/db.ts`, `server/scripts/db.ts`, `server/test/global-setup.ts`, `server/test/helpers.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Produces:
  - `prisma: PrismaClient`, exportado desde `src/db.ts`.
  - `resetDb(): Promise<void>`: `TRUNCATE` de todas las tablas de `public` salvo `_prisma_migrations`, con `RESTART IDENTITY CASCADE`.
  - `testConfig(overrides?: Partial<Config>): Config`, con `databaseUrl` de pruebas, `jwtSecret` de 32 caracteres, `authRateLimit: 1000` y `mail: { from: 'test@eco' }`.
  - `makeApp(overrides?: Partial<Config>, deps?: Partial<AppDeps>)`, equivalente a `createApp(testConfig(overrides), deps)`.

- [ ] **Step 1: Escribir `schema.prisma`** con **todas** las tablas y enums del spec §3 (User, EmailCode, Material, MaterialImage, SavedMaterial, SavedSearch, Report, Conversation, Message, Agreement, Review, Notification, DeviceToken, BotJob), con los índices, restricciones únicas y cascadas que el spec indica.
  - `User.notificationPrefs` es `Json` con `@default("{\"push\":true,\"quietNight\":false,\"categories\":{\"mensajes\":true,\"acuerdos\":true,\"busquedas\":true,\"cuenta\":true}}")`.
  - Los enums con tilde se mapean con `@map`: `Donacion @map("Donación")`, `ComoNuevo @map("Como nuevo")`, `BuenEstado @map("Buen estado")`.
  - `Review` incluye `authorName String` y `authorId String?`.

- [ ] **Step 2: Escribir `scripts/db.ts`.** Inicia `EmbeddedPostgres` con `databaseDir: '.pg-data'`, `port: 5433`, usuario y clave `postgres`, `persistent: true`. Ejecuta `initialise()` solo si `.pg-data` no existe, luego `start()` y crea las bases `ecoestudiante` si no existen. Imprime `PostgreSQL listo en el puerto 5433 (Ctrl+C para detener)` y detiene la base con `SIGINT`.

- [ ] **Step 3: Crear la migración inicial.** En una terminal `npm run db`, en otra:

```bash
cp .env.example .env   # y completar JWT_SECRET con 32+ caracteres
npx prisma migrate dev --name init
```

Esperado: `server/prisma/migrations/<fecha>_init/migration.sql` con los 14 `CREATE TABLE` del spec §3.

- [ ] **Step 4: Escribir `test/global-setup.ts`.**
  - `setup()`: inicia `EmbeddedPostgres` en un directorio temporal (`os.tmpdir()`), puerto **5434**, `persistent: false`; crea la base `ecoestudiante_test`; fija `process.env.DATABASE_URL` hacia ella; ejecuta `npx prisma migrate deploy` con `execSync` y ese entorno.
  - `teardown()`: detiene la base.

- [ ] **Step 5: Escribir la prueba que falla** en `test/db.test.ts`:

```ts
beforeEach(resetDb)
it('crea un usuario con preferencias por defecto', async () => {
  const u = await prisma.user.create({ data: { name: 'Ana Torres', email: 'ana@upsjb.edu.pe', career: 'Contabilidad', cycle: 2, passwordHash: 'x' } })
  expect(u.verified).toBe(false); expect(u.isBot).toBe(false)
  expect(u.notificationPrefs).toEqual({ push: true, quietNight: false, categories: { mensajes: true, acuerdos: true, busquedas: true, cuenta: true } })
})
it('no permite dos conversaciones del mismo comprador por material', async () => { /* crea 2 users + material + conversation; la segunda create rechaza con code P2002 */ })
it('resetDb deja las tablas vacías', async () => { /* crea user, resetDb(), count === 0 */ })
```

- [ ] **Step 6: Ejecutar** `npm test`. Esperado: FAIL hasta implementar `db.ts` y `helpers.ts`. Implementarlos y volver a ejecutar: todas en PASS (incluidas las de la Task 1, ahora con `testConfig` desde `helpers.ts`).

- [ ] **Step 7: Commit.**

```bash
git add server
git commit -m "Servidor: schema Prisma completo y PostgreSQL embebido para desarrollo y pruebas"
```

---

### Task 3: Constantes compartidas y datos sembrados

**Files:**
- Create: `shared/constants.ts`, `shared/seed-data.ts`, `server/prisma/seed.ts`
- Modify: `src/lib/data.ts` (pasa a re-exportar y construir `createSeedState` desde `shared/`), `src/lib/store.ts` (importa `INSTITUTIONAL_EMAIL` desde `shared/constants`), `tsconfig.json` (`include` agrega `"shared"`)
- Test: `server/test/seed.test.ts`

**Interfaces:**
- Produces:
  - Desde `shared/constants.ts`: `MODES`, `CATEGORIES`, `CONDITIONS`, `CAREERS`, `CYCLES`, `COURSES`, `SAFE_POINTS`, `REPORT_REASONS`, `COMMUNITY_RULES` (mismos valores que hoy en `src/lib/data.ts`) e `INSTITUTIONAL_EMAIL`.
  - Desde `shared/seed-data.ts`: `SEED_USERS: { id; name; email; career; cycle }[]`, `SEED_MATERIALS: { id; title; course; career; cycle; category; mode; price; exchangeFor?; condition; ownerId; images: string[]; description; status; daysAgo: number }[]` (los mismos 6 usuarios y materiales de hoy, con sus ids actuales) y `SEED_REVIEWS` (igual que hoy).
  - `seed(prisma: PrismaClient): Promise<void>`, exportada desde `prisma/seed.ts`. Es idempotente: hace `upsert` por id y borra y recrea las reseñas sembradas (`agreementId: null`).

- [ ] **Step 1: Mover** las constantes y los datos a `shared/`. `src/lib/data.ts` queda re-exportando todo y conserva `createSeedState`, `simulatedReply`, `STATE_VERSION` y `baseRating`/`baseRatingCount` (el frontend local aún los usa hasta la etapa 2). Verificar que la app sigue igual: `npx tsc --noEmit` en la raíz sin errores.

- [ ] **Step 2: Escribir la prueba que falla** en `test/seed.test.ts`:

```ts
beforeEach(resetDb)
it('siembra 6 bots verificados, sus materiales y reseñas', async () => {
  await seed(prisma)
  expect(await prisma.user.count({ where: { isBot: true, verified: true } })).toBe(6)
  expect(await prisma.material.count()).toBe(SEED_MATERIALS.length)
  expect(await prisma.materialImage.count()).toBe(SEED_MATERIALS.reduce((n, m) => n + m.images.length, 0))
  expect(await prisma.review.count()).toBe(Object.values(SEED_REVIEWS).flat().length)
  expect((await prisma.material.findUnique({ where: { id: 'm-1' } }))!.ownerId).toBe(SEED_MATERIALS[0].ownerId)
})
it('es idempotente', async () => { await seed(prisma); await seed(prisma); /* mismos conteos */ })
it('la contraseña de un bot no es "" ni un hash conocido', async () => { /* bcrypt.compare('', hash) === false */ })
```

- [ ] **Step 3: Ejecutar** `npm test -- seed`. Esperado: FAIL.

- [ ] **Step 4: Implementar `seed(prisma)`.**
  - Bots con `isBot: true`, `verified: true` y `passwordHash` = bcrypt de `crypto.randomBytes(24).toString('hex')`.
  - `createdAt` de materiales = `now - daysAgo días`.
  - Reseñas con `targetId` = id del bot, `authorName` del dato y `createdAt` = `now - daysAgo`.
  - El archivo ejecuta `seed(new PrismaClient())` cuando se lanza directo (`npx prisma db seed`).

- [ ] **Step 5: Ejecutar** `npm test` y `npx prisma db seed` contra la base de desarrollo. Esperado: PASS, y el seed termina sin error dos veces seguidas.

- [ ] **Step 6: Commit.**

```bash
git add shared server src/lib/data.ts src/lib/store.ts tsconfig.json
git commit -m "Constantes y datos de ejemplo compartidos; seed de la base de datos"
```

---

### Task 4: Envío de correos (con modo local)

**Files:**
- Create: `server/src/integrations/mail.ts`
- Modify: `server/src/app.ts` (`AppDeps = { mailer: Mailer }`, por defecto `createMailer(config)`)
- Test: `server/test/mail.test.ts`

**Interfaces:**
- Produces:
  - `type Mailer = { mode: 'resend' | 'smtp' | 'console'; sendVerificationCode(to: string, name: string, code: string): Promise<void> }`
  - `createMailer(config: Config, fetchImpl = fetch): Mailer`: usa Resend si hay `resendApiKey`; si no, SMTP si hay `smtp`; si no, `console`.

- [ ] **Step 1: Escribir la prueba que falla:**

```ts
it('sin claves usa modo consola e imprime el código', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const m = createMailer(testConfig())
  expect(m.mode).toBe('console')
  await m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '123456')
  expect(log.mock.calls.flat().join(' ')).toContain('123456')
})
it('con RESEND_API_KEY llama a la API de Resend', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  const m = createMailer(testConfig({ mail: { resendApiKey: 're_x', from: 'Eco <a@b.c>' } }), fetchImpl)
  await m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '123456')
  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('https://api.resend.com/emails')
  expect(init.headers.Authorization).toBe('Bearer re_x')
  expect(JSON.parse(init.body)).toMatchObject({ to: ['ana@upsjb.edu.pe'], subject: 'Tu código de EcoEstudiante: 123456' })
})
it('si Resend responde error, lanza AppError 502 MAIL_FAILED', async () => { /* status 422 → rejects con code MAIL_FAILED */ })
```

- [ ] **Step 2: Ejecutar** y ver el FAIL. **Step 3: Implementar.**
  - Asunto: `Tu código de EcoEstudiante: <code>`.
  - El cuerpo HTML y de texto saluda por el nombre, muestra el código grande y aclara que vence en 15 minutos.
  - En SMTP usa `nodemailer.createTransport({ host, port, secure: port === 465, auth })`.
  - En consola imprime `[correo] Código para <to>: <code>`.
  - Si falla, lanza `AppError(502, 'MAIL_FAILED', 'No pudimos enviar el correo. Inténtalo en un momento.')`.

- [ ] **Step 4: Ejecutar** `npm test`: PASS. **Step 5: Commit** con `git commit -m "Servidor: envío de correos con Resend, SMTP o consola"`.

---

### Task 5: Módulo de autenticación

**Files:**
- Create: `server/src/modules/auth/schemas.ts`, `service.ts`, `tokens.ts`, `routes.ts`
- Modify: `server/src/app.ts` (monta `/api/auth` con rate limit)
- Test: `server/test/auth.test.ts`; helper `registerAndVerify()` en `test/helpers.ts`

**Interfaces:**
- Consumes: `prisma`, `Mailer`, `AppError`, `body()`, `INSTITUTIONAL_EMAIL`, `CAREERS`.
- Produces:
  - `signToken(userId: string, secret: string): string` y `verifyToken(token: string, secret: string): string | null`, en `tokens.ts`.
  - `type MeDto = { id; name; email; career; cycle; verified: true; notificationPrefs; createdAt: string }`, con `toMe(user): MeDto` en `modules/users/dto.ts` (lo crea esta task).
  - Respuestas:

| Endpoint | Body | Respuesta OK |
|---|---|---|
| `POST /api/auth/register` | `{name, email, career, cycle, password}` | 201 `{ userId, devCode? }` |
| `POST /api/auth/verify` | `{userId, code}` | 200 `{ token, user: MeDto }` |
| `POST /api/auth/resend-code` | `{userId}` | 200 `{ ok: true, devCode? }` |
| `POST /api/auth/login` | `{email, password}` | 200 `{ token, user: MeDto }` |

  - `devCode` se incluye **solo** si `mailer.mode === 'console'`. Así la pantalla de verificación puede seguir mostrando el código en modo demostración.
  - `helpers.registerAndVerify(app, overrides?) → Promise<{ token: string; user: MeDto }>`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `test/auth.test.ts` (`beforeEach(resetDb)`; el body válido base es `{ name: 'Ana Torres', email: 'ana.torres@upsjb.edu.pe', career: 'Contabilidad', cycle: 3, password: 'secreta123' }`):
  - `registro → verify con devCode → 200 con token y user.verified === true`. Además crea una `Notification` de categoría `cuenta` con el texto `'¡Bienvenido/a a EcoEstudiante! Tu correo institucional quedó verificado.'` y link `'#/cuenta'`.
  - `correo con mayúsculas y espacios se normaliza`: registrar `' Ana.Torres@UPSJB.edu.pe '` guarda `ana.torres@upsjb.edu.pe`, y el login con `'ANA.TORRES@upsjb.edu.pe'` funciona.
  - `correo no institucional` (`ana@gmail.com`): 400 `VALIDATION` con `fields.email === 'Usa tu correo institucional (nombre.apellido@upsjb.edu.pe).'`.
  - `contraseña de 7 caracteres`: 400 con `fields.password === 'Usa al menos 8 caracteres.'`.
  - `carrera fuera de CAREERS` o `cycle` 11: 400 `VALIDATION`.
  - `campos de más` (`isBot: true`): 400 `VALIDATION`, porque los esquemas son `.strict()`.
  - `registrar de nuevo un correo no verificado actualiza nombre y contraseña y responde 201`. Un correo ya verificado responde 409 `EMAIL_TAKEN` con `'Ya existe una cuenta con este correo. Inicia sesión.'`.
  - `código incorrecto`: 400 `INVALID_CODE` con `'El código no coincide. Revisa tu correo e inténtalo otra vez.'` e incrementa `attempts`.
  - `tras 5 intentos fallidos, el código correcto responde 429 TOO_MANY_ATTEMPTS` con `'Demasiados intentos. Pide un código nuevo.'`.
  - `código vencido` (actualizar `expiresAt` al pasado con prisma): 400 `CODE_EXPIRED` con `'El código venció. Pide uno nuevo.'`.
  - `resend antes de 60 s`: 429 `RATE_LIMITED` con `'Espera un minuto antes de pedir otro código.'`. Pasados 60 s (mover `createdAt` atrás 61 s) responde 200, y el código anterior deja de servir.
  - `login con contraseña incorrecta o correo inexistente`: ambos responden 401 `INVALID_CREDENTIALS` con el mismo mensaje `'Correo o contraseña incorrectos.'`.
  - `login de cuenta no verificada`: 403 `EMAIL_NOT_VERIFIED` con `error.userId`. Si el último código tiene más de 60 s, se envía uno nuevo y se incluye `error.devCode` en modo consola; si no, se reutiliza el vigente y no hay `devCode`.
  - `login de un bot con contraseña vacía`: 401.
  - `rate limit`: con `makeApp({ authRateLimit: 3 })`, la 4.ª petición a `/api/auth/login` responde 429 `RATE_LIMITED` con `'Demasiados intentos. Espera un minuto.'`.
  - `el correo se envía con el código`: un `mailer` falso inyectado por `deps` registra `(to, name, code)`, y `code` coincide con el `devCode`.

- [ ] **Step 2: Ejecutar** `npm test -- auth`. Esperado: FAIL.

- [ ] **Step 3: Implementar.**
  - `service.ts` expone `register`, `verify`, `resendCode` y `login`, que reciben `(input, { mailer, config })`.
  - Al crear un código se borran los `EmailCode` previos del usuario.
  - El código se genera con `crypto.randomInt(100000, 1000000)`.
  - La comparación del hash usa `crypto.timingSafeEqual`.
  - La verificación y la notificación de bienvenida van dentro de `prisma.$transaction`.
  - `routes.ts` aplica `rateLimit({ windowMs: 60_000, limit: config.authRateLimit, handler })`, donde el handler lanza el `AppError` 429.

- [ ] **Step 4: Ejecutar** `npm test`: todo en PASS. **Step 5: Commit** con `git commit -m "Servidor: registro, verificación por correo e inicio de sesión"`.

---

### Task 6: Autenticación por token y módulo de usuarios

**Files:**
- Create: `server/src/middleware/auth.ts`, `server/src/modules/users/routes.ts`, `service.ts`, `schemas.ts`
- Modify: `server/src/modules/users/dto.ts`, `server/src/modules/auth/routes.ts` (agrega `GET /me`), `server/src/app.ts`
- Test: `server/test/users.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `toMe`, `registerAndVerify`.
- Produces:
  - `requireAuth(config): RequestHandler`, que deja `req.user: { id: string }` (aumentar el tipo de Express en `src/types/express.d.ts`).
  - `GET /api/auth/me` 🔒 → `MeDto`.
  - `PATCH /api/users/me` 🔒 con body `{ name?, career?, cycle?, notificationPrefs? }` (`.strict()`, al menos un campo) → `MeDto`.
  - `GET /api/users/:id` → `PublicUserDto = { id; name; career; cycle; createdAt; rating: { value: number; count: number }; reviews: { authorName; stars; comment; materialTitle; createdAt }[] }`. Las reseñas van de la más nueva a la más antigua y `rating.value` se redondea a un decimal (0 si no hay reseñas). El campo `materials` se agrega en la etapa 2.
  - `userRating(userId): Promise<{ value: number; count: number }>`, en `users/service.ts` (lo reutilizan las etapas 2 y 3).

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - `GET /api/auth/me con token válido` devuelve el `MeDto` sin `passwordHash`.
  - Un token ausente, `'Bearer basura'`, uno firmado con otro secreto, uno vencido (firmado con `expiresIn: -1`) o el de un usuario borrado responden 401 `UNAUTHENTICATED` con `'Tu sesión expiró. Vuelve a ingresar.'`.
  - `PATCH /users/me` cambia `name` y `cycle`, e ignora mayúsculas y espacios de más en el nombre (`trim`). `{}` responde 400. Un `email` en el body responde 400 (no se puede cambiar).
  - `PATCH notificationPrefs` con `categories.busquedas: false` se guarda y `/auth/me` lo devuelve.
  - Tras `seed`, `GET /users/u-maria` devuelve 3 reseñas, `rating.count === 3` y `rating.value === 4.7`. Sin `email` en la respuesta.
  - `GET /users/no-existe` responde 404 `USER_NOT_FOUND` con `'Este estudiante no existe.'`.

- [ ] **Step 2: Ejecutar** y ver el FAIL. **Step 3: Implementar.**
  - `requireAuth` verifica el token y comprueba que el usuario exista y esté verificado (consulta por id).
  - `userRating` usa `prisma.review.aggregate({ _avg: { stars }, _count })`.

- [ ] **Step 4: Ejecutar** `npm test` y `npm run typecheck`: PASS. **Step 5: Commit** con `git commit -m "Servidor: sesión con JWT y perfiles de usuario"`.

---

### Task 7: README del servidor y prueba de punta a punta en local

**Files:**
- Create: `server/README.md`

- [ ] **Step 1: Escribir `server/README.md`** en español con:
  - requisitos (Node 22+),
  - primera vez (`npm install`, `cp .env.example .env`, `npm run db` en una terminal, `npx prisma migrate dev`, `npx prisma db seed`),
  - el día a día (`npm run db` + `npm run dev`),
  - pruebas (`npm test`, que no necesita `npm run db`),
  - una tabla de variables que remite a `.env.example`,
  - cómo ver la base (`npx prisma studio`).

- [ ] **Step 2: Verificar a mano** siguiendo el README desde cero (borrando `.pg-data`). Con `npm run dev` corriendo:

```bash
curl -s localhost:3000/api/health
curl -s -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Prueba Uno\",\"email\":\"prueba.uno@upsjb.edu.pe\",\"career\":\"Derecho\",\"cycle\":1,\"password\":\"secreta123\"}"
```

Esperado: `{"ok":true}`, luego `{"userId":"...","devCode":"NNNNNN"}`, y la consola del servidor muestra `[correo] Código para prueba.uno@upsjb.edu.pe: NNNNNN`.

- [ ] **Step 3: Commit** con `git commit -m "Servidor: guía para ejecutarlo en local"`.

---

### Task 8: Cliente de API en el frontend

**Files:**
- Create: `src/lib/api.ts`
- Modify: `src/vite-env.d.ts` (tipo `ImportMetaEnv.VITE_API_URL`), `.gitignore` (ya ignora `.env*`); crear `.env.example` en la raíz con `VITE_API_URL=http://localhost:3000`

**Interfaces:**
- Produces, en `src/lib/api.ts`:
  - `API_URL: string`, igual a `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`.
  - `class ApiError extends Error { code: string; status: number; details: Record<string, unknown> }`. Si `fetch` falla por red, la función lanza `ApiError` con `code 'NETWORK'`, `status 0` y el mensaje `'No pudimos conectar con el servidor. Revisa tu conexión.'`.
  - `getToken(): string | null`, `setToken(token: string | null): void`, con la clave `localStorage` `ecoestudiante:token` (todo dentro de `try/catch`).
  - `api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T>`. Antepone `${API_URL}/api` y agrega `Authorization` si hay token. Ante un 401 en una ruta que no es `/auth/*`, ejecuta `setToken(null)` y luego `onUnauthorized()`.
  - `setUnauthorizedHandler(fn: () => void): void`.
  - `waitForServer(onSlow: () => void): Promise<boolean>`. Llama a `/api/health`; si no responde en 1500 ms ejecuta `onSlow()` y reintenta cada 3 s hasta 60 s. Devuelve `false` si se agota el tiempo.

- [ ] **Step 1: Implementar `api.ts`** con esas firmas. Verificar con `npx tsc --noEmit` en la raíz: sin errores.

- [ ] **Step 2: Commit** con `git commit -m "App: cliente HTTP para el servidor"`.

---

### Task 9: Autenticación de la app contra el servidor

**Files:**
- Modify: `src/lib/store.ts` (sección auth), `src/screens/Auth.tsx`, `src/screens/Account.tsx` (`updateProfile`), `src/App.tsx` (arranque)

**Interfaces:**
- Consumes: `api`, `ApiError`, `setToken`, `getToken`, `waitForServer`, `setUnauthorizedHandler`.
- Produces, cambios en `store.ts`:
  - `register(input) → Promise<{ error: string; field?: string } | { userId: string; devCode?: string }>`
  - `verifyEmail(userId, code) → Promise<{ error: string } | { ok: true }>`
  - `resendCode(userId) → Promise<{ error: string } | { devCode?: string }>`
  - `login(email, password) → Promise<{ error: string } | { needsVerification: true; userId: string; devCode?: string } | { ok: true }>`
  - `restoreSession() → Promise<void>`: si hay token, llama a `GET /auth/me` y actualiza la caché. Si la respuesta es un `ApiError` 401, cierra la sesión. Ante un error `NETWORK`, conserva la sesión en caché.
  - `logout()`: además ejecuta `setToken(null)`.
  - `updateProfile(patch) → Promise<void>`: llama a `PATCH /users/me` y muestra `toast` de error si falla.
  - Helper interno `adoptUser(me: MeDto)`: hace upsert de `{ id, name, email, career, cycle, verified: true, createdAt }` en `state.users` y fija `sessionUserId`.
  - Se eliminan `hashPassword` y el uso de `pendingCode` y `passwordHash` (los campos se quitan de `User` en `types.ts`).

- [ ] **Step 1: Cambiar `store.ts`** según las firmas anteriores. Los errores de validación del servidor (`error.fields`) se devuelven con su `field` para que el formulario lo marque en el campo correcto.

- [ ] **Step 2: Cambiar `Auth.tsx`.**
  - El formulario de registro valida mínimo 8 caracteres y su texto de ayuda dice `"Mínimo 8 caracteres"`.
  - `VerifyForm` recibe `devCode?: string` y muestra el recuadro "Modo demostración" **solo si existe**; si no, muestra `"Revisa también la carpeta de spam."`.
  - "Reenviar código" muestra el error del servidor (por ejemplo, el de esperar un minuto) con `toast(..., 'error')`.
  - El botón "Verificar y entrar" se deshabilita mientras espera.

- [ ] **Step 3: Cambiar `App.tsx`.** Antes de mostrar Auth o la app, ejecuta `waitForServer` y luego `restoreSession()`.
  - Mientras tanto muestra la pantalla de carga con `AppLogo` y, si `onSlow` se disparó, el texto `"Conectando con el servidor…"`.
  - Si `waitForServer` devuelve `false` y hay sesión en caché, entra igual (modo sin conexión de la etapa 3). Si no hay sesión, muestra `"No pudimos conectar con el servidor."` con un botón "Reintentar".
  - `setUnauthorizedHandler(() => { logout(); navigate('#/') })`.

- [ ] **Step 4: `Account.tsx`.** Ajustar el guardado del perfil a `await updateProfile(...)`, con el botón deshabilitado mientras guarda.

- [ ] **Step 5: Verificar en el navegador.** Con el servidor (`npm run db` + `npm run dev` en `server/`) y la app (`preview_start`):
  1. Registrar `prueba.dos@upsjb.edu.pe`: se ve el recuadro con el código y la consola del servidor muestra el mismo código.
  2. Un código incorrecto muestra el error en español. El correcto lleva a Explorar con la notificación de bienvenida.
  3. Recargar la página mantiene la sesión. Cerrar sesión y volver a ingresar funciona. Con una contraseña incorrecta aparece `"Correo o contraseña incorrectos."`.
  4. Editar el nombre en Mi cuenta, recargar y comprobar que persiste (el cambio viene del servidor).
  5. Detener `npm run dev` y recargar: aparece "Conectando con el servidor…" y, a los 60 s, el mensaje con "Reintentar". Reiniciar el servidor y pulsar "Reintentar" entra.
  6. Explorar, publicar y chatear siguen funcionando con los datos locales (modo mixto de la etapa 1).

  Sin errores en `read_console_messages`. Tomar una captura de la pantalla de verificación.

- [ ] **Step 6: Commit** con `git commit -m "App: registro, verificación e inicio de sesión contra el servidor"`.

---

## Etapas siguientes

Las etapas 2 a 5 del spec (§9) tienen cada una su propio plan, que se escribe al terminar la anterior para partir del
código real: `2026-11-XX-backend-etapa-2-materiales.md`, `…-etapa-3-chat-acuerdos.md`, `…-etapa-4-bots.md` y
`…-etapa-5-push-despliegue.md`.
