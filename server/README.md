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
| Correo | `BREVO_API_KEY` (recomendado en Render), `RESEND_API_KEY` o `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` (solo local) | El código de verificación se imprime en la consola y la app lo muestra en "Modo demostración" |
| Fotos | `CLOUDINARY_URL` (en tu panel de Cloudinary: *Settings → API Keys → API environment variable*, con la forma `cloudinary://<key>:<secret>@<cloud>`) | Se guardan en `server/uploads/` y se sirven en `/uploads/…` |
| Push | `FIREBASE_SERVICE_ACCOUNT` | No se envían notificaciones push (etapa 5) |
| Estudiantes simulados | `BOTS_ENABLED=true` | Los bots no responden, no confirman entregas ni se interesan en lo que publicas |

## Despliegue en Render (gratis)

El servidor está publicado en https://ecoestudiante-api.onrender.com. Para desplegarlo de nuevo, o en otra cuenta:

1. Crea los servicios y anota sus claves en `server/.env.render`, que está fuera de git:
   - **Neon:** base de datos. Usa la conexión **directa**, sin `-pooler`.
   - **Cloudinary:** fotos.
   - **Brevo:** correo. Verifica el remitente y desactiva el bloqueo de IP para claves API, porque Render no tiene IP fija.
   - **Firebase:** push. La cuenta de servicio va en base64.
2. En Render, ve a **New › Blueprint**, elige este repositorio y la rama. Render lee `render.yaml` (raíz del repositorio)
   y crea `ecoestudiante-api` en Ohio.
3. Carga las variables marcadas como secretas: `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`, `BREVO_API_KEY`,
   `MAIL_FROM` (sin comillas) y `FIREBASE_SERVICE_ACCOUNT`.
4. El primer despliegue aplica las migraciones y carga los datos de ejemplo (`npm run start:prod`).
   Compruébalo en `https://ecoestudiante-api.onrender.com/api/health`.

> Render gratuito **bloquea los puertos SMTP**: en producción el correo debe ir por `BREVO_API_KEY` (o `RESEND_API_KEY`
> con dominio propio). Gmail SMTP solo sirve en local.

### Ver los bots en acción

Con `BOTS_ENABLED=true`, inicia sesión en la app y:

1. Escríbele a María (la calculadora Casio): responde en 3 a 8 segundos.
2. Propónle una entrega: la confirma en 10 a 20 segundos y el material queda Reservado.
3. Publica un material: en 30 a 60 segundos un bot te escribe interesado.

Los trabajos pendientes están en la tabla `BotJob` (con `npx prisma studio` puedes verlos).

## Ver la base de datos

```bash
npx prisma studio
```

Abre una página en el navegador para ver y editar las tablas.

## Estructura

```
prisma/schema.prisma    diseño de la base de datos (15 tablas)
prisma/migrations/      SQL que crea las tablas
prisma/seed.ts          datos de ejemplo
src/app.ts              arma Express: CORS, JSON, rutas y errores
src/config.ts           lee y valida el .env
src/modules/<tema>/     routes.ts (URLs y validación) · service.ts (reglas) · schemas.ts (zod)
src/integrations/       correo (y luego fotos y push)
test/                   pruebas automáticas (Vitest + Supertest)
```
