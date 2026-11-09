# Servidor de EcoEstudiante

API REST + base de datos de EcoEstudiante (Node.js, TypeScript, Express, Prisma y PostgreSQL).
La explicación completa del diseño está en [`docs/backend-explicado.md`](../docs/backend-explicado.md).

## Requisitos

- **Node.js 22 o superior** (incluye npm).
- No hace falta instalar PostgreSQL ni Docker: `npm run db` usa un PostgreSQL embebido que se instala con npm.

## Primera vez

Todos los comandos se ejecutan dentro de la carpeta `server/`.

```bash
npm install
cp .env.example .env
```

Abre `.env` y completa `JWT_SECRET` con una clave aleatoria de 32 caracteres o más. Para generarla:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Luego, en **una terminal**, inicia la base de datos y déjala abierta:

```bash
npm run db
```

En **otra terminal**, crea las tablas y carga los datos de ejemplo (estudiantes simulados, materiales y reseñas):

```bash
npx prisma migrate dev
npx prisma db seed
```

## Día a día

| Terminal 1 | Terminal 2 |
|---|---|
| `npm run db` | `npm run dev` |

El servidor queda en `http://localhost:3000` y se reinicia solo al guardar cambios.
Compruébalo en `http://localhost:3000/api/health`, que responde `{"ok":true}`.

Si cerraste la terminal de la base sin `Ctrl+C` y `npm run db` dice que el puerto está ocupado:

```bash
npm run db:stop
```

## Pruebas

```bash
npm test
```

No necesita `npm run db`: las pruebas inician su propio PostgreSQL temporal, aplican las migraciones y lo borran al
terminar. Para revisar los tipos: `npm run typecheck`.

## Configuración

Cada variable está explicada en [`.env.example`](.env.example). Solo `DATABASE_URL` y `JWT_SECRET` son obligatorias.
Los servicios externos son opcionales: sin ellos el servidor funciona igual en modo local.

| Servicio | Variables | Sin configurar |
|---|---|---|
| Correo | `RESEND_API_KEY` o `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` | El código de verificación se imprime en la consola y la app lo muestra en "Modo demostración" |
| Fotos | `CLOUDINARY_URL` (en tu panel de Cloudinary: *Settings → API Keys → API environment variable*, con la forma `cloudinary://<key>:<secret>@<cloud>`) | Se guardan en `server/uploads/` y se sirven en `/uploads/…` |
| Push | `FIREBASE_SERVICE_ACCOUNT` | No se envían notificaciones push (etapa 5) |

## Ver la base de datos

```bash
npx prisma studio
```

Abre una página en el navegador para ver y editar las tablas.

## Estructura

```
prisma/schema.prisma    diseño de la base de datos (14 tablas)
prisma/migrations/      SQL que crea las tablas
prisma/seed.ts          datos de ejemplo
src/app.ts              arma Express: CORS, JSON, rutas y errores
src/config.ts           lee y valida el .env
src/modules/<tema>/     routes.ts (URLs y validación) · service.ts (reglas) · schemas.ts (zod)
src/integrations/       correo (y luego fotos y push)
test/                   pruebas automáticas (Vitest + Supertest)
```
