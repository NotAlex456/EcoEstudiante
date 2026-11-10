# Backend EcoEstudiante, Etapa 5 (Push y despliegue): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Con la app cerrada, el celular recibe una notificación de Android cuando llega un aviso. El servidor queda
publicado gratis en internet (Render + Neon + Cloudinary + correo real) y el APK 2.0 apunta a él.

**Architecture:** `notify()` gana su última rama: si el usuario **no tiene sockets conectados**, envía un push con
Firebase Cloud Messaging a todos sus `DeviceToken`, salvo que tenga el push apagado o sea horario silencioso. En el
celular, la app **cierra el socket al pasar a segundo plano**, así "en segundo plano" significa siempre "recibe push"; al
volver, reconecta y sincroniza. Las preferencias que el servidor necesita (push, horario silencioso y categorías) pasan
a `User.notificationPrefs`; las que solo afectan a la pantalla siguen en el teléfono.

**Tech Stack:** lo de las etapas anteriores, más `firebase-admin` (servidor) y `@capacitor/push-notifications` (app).
Despliegue: Neon (PostgreSQL), Render (servidor), Cloudinary (fotos) y Gmail SMTP o Resend (correo).

**Spec:** `docs/superpowers/specs/2026-11-09-backend-design.md`: §3 DeviceToken; §4.2 `/devices` y `PATCH /users/me`;
§5.1 pasos 2 y 3; §5.2; §6 Notificaciones, Ajustes y Android; §7 (`notify`); §8 completo; §9 etapa 5.

## Global Constraints

- Todo lo de las etapas 1 a 4 sigue vigente: errores en español con `{ error: { code, message } }`, `.strict()` y `requireAuth`.
- **Un fallo del push nunca rompe la acción que lo causó.** Enviar un mensaje responde 201 aunque Firebase falle; el error se registra en la consola.
- Sin `FIREBASE_SERVICE_ACCOUNT`, el push se omite en silencio (modo local), igual que el correo y las fotos.
- Horario silencioso: de **22:00 a 06:59 hora de Lima** (`America/Lima`, UTC−5 fijo) no se envía push. El aviso igual se guarda.
- Ningún secreto va a git: `.env`, la cuenta de servicio de Firebase, `google-services.json`, el `.jks` y `keystore.properties`.
- En la raíz, las dependencias se instalan con `npx pnpm@10.34.3 add …`; nunca con `npm i`.
- Textos del push: título `EcoEstudiante`, cuerpo = texto de la notificación, dato `link` = link de la notificación.

## Review Focus

1. **Firebase falla o tarda** (credencial mala, sin red, token raro): la acción del usuario (enviar mensaje, proponer, confirmar…) responde igual, sin 500. La prueba va en la Task 1.
2. **El mismo celular con dos cuentas** (cierra sesión y entra otra persona): el token pasa a la cuenta nueva y la anterior deja de recibir sus avisos. La prueba va en la Task 1.
3. **Token que Firebase ya no reconoce** (app desinstalada): se borra y no se vuelve a intentar. La prueba va en la Task 1.
4. **Bordes del horario silencioso** (21:59, 22:00, 06:59 y 07:00 en Lima, y un servidor en UTC): exactamente 22:00–06:59 sin push. La prueba va en la Task 1.
5. **APK contra el servidor dormido de Render** (arranque en frío de 30–50 s y orígenes CORS del APK): la app muestra "Conectando con el servidor…" y luego funciona, incluido el socket. Se verifica a mano en la Task 6.

---

## Mapa de archivos

```
server/src/integrations/push.ts          ← createPushSender(config): PushSender (firebase | off)
server/src/notify/notify.ts              ← createNotifier({ realtime, push, now? }): emite o envía push
server/src/modules/devices/routes.ts     ← POST /devices, DELETE /devices/:token, POST /devices/test
server/src/config.ts, src/app.ts, src/index.ts, src/hub.ts, .env.example, package.json (start:prod)
server/test/{push,devices,notifications}.test.ts, test/helpers.ts (fakePush)
render.yaml                              ← blueprint de Render (raíz del repo)
src/lib/push.ts (nuevo), src/lib/alerts.ts, src/lib/settings.ts, src/lib/store.ts, src/lib/socket.ts, src/App.tsx
src/screens/Settings.tsx
android/app/google-services.json (fuera de git), android/.gitignore, android/app/build.gradle (2.0)
.env.production (VITE_API_URL), ANDROID.md, README.md, docs/backend-explicado.md, spec §9
```

---

### Task 1: Push en el servidor (`push.ts`, `notify()` y `/devices`)

**Files:**
- Create: `server/src/integrations/push.ts`, `server/src/modules/devices/routes.ts`, `server/test/push.test.ts`, `server/test/devices.test.ts`
- Modify: `server/src/config.ts` (`firebaseServiceAccount?: object`, leído de `FIREBASE_SERVICE_ACCOUNT` en base64; si no decodifica a JSON, `loadConfig` falla con un mensaje claro), `server/src/notify/notify.ts`, `server/src/app.ts` (`AppDeps.push`), `server/src/index.ts`, `server/test/helpers.ts` (`fakePush()`), `server/test/notifications.test.ts`, `server/.env.example`
- Instalar en `server/`: `firebase-admin`

**Interfaces:**
- Produces:
  - `type PushMessage = { title: string; body: string; link: string }`
  - `type PushSender = { mode: 'firebase' | 'off'; send(tokens: string[], message: PushMessage): Promise<{ invalidTokens: string[] }> }`
  - `createPushSender(config): PushSender`:
    - **Sin credencial:** `mode: 'off'` y `send` no hace nada.
    - **Con credencial:** `firebase-admin` con `sendEachForMulticast`, con `notification { title, body }`, `data { link }`, `android.priority: 'high'` y `android.notification { channelId: 'eco-sonido-vibra', icon: 'ic_stat_eco', color: '#176B4B' }`.
    - Los errores `messaging/registration-token-not-registered` y `messaging/invalid-registration-token` van a `invalidTokens`.
  - `isQuietHour(now: Date): boolean`: `true` si la hora en Lima es ≥ 22 o < 7.
  - `createNotifier({ realtime, push, now = () => new Date() })`. Mantiene lo de la etapa 3 y agrega el paso 3:
    1. Crea la fila. Si es bot o la categoría está apagada, termina.
    2. Si `realtime.isOnline(userId)`: emite `notification:new` y termina.
    3. Si `prefs.push !== false` y `!(prefs.quietNight && isQuietHour(now()))`, envía el push a todos sus tokens y borra los `invalidTokens`.
    4. Cualquier error del push se captura y se registra con `console.error`; `notify` nunca lanza por el push.
  - Rutas 🔒:
    - `POST /api/devices` con `{ token: string 1–4096, platform: 'android' | 'web' }` → 204. Hace upsert por `token`: si era de otra cuenta, pasa a esta.
    - `DELETE /api/devices/:token` → 204. Solo borra un token propio; uno ajeno o inexistente también responde 204, sin revelar nada.
    - `POST /api/devices/test` → 202. A los 10 s envía a **mis** tokens `{ title: 'EcoEstudiante', body: 'Así te avisaremos cuando EcoEstudiante esté cerrada.', link: '#/cuenta/notificaciones' }`, sin mirar si estoy en línea. Sirve para probarlo con la app cerrada.
  - `fakePush()` (pruebas) → `PushSender & { sent: { tokens: string[]; message: PushMessage }[]; invalid: Set<string>; fail: boolean }`.

- [ ] **Step 1: Pruebas que fallan.**
  - `push.test.ts`:
    - `isQuietHour` en 21:59 → false, 22:00 → true, 06:59 → true y 07:00 → false. Las fechas se arman con `-05:00`; la prueba también pasa si el proceso corre con `TZ=UTC`.
    - `createPushSender` sin credencial → `mode: 'off'` y `send` devuelve `{ invalidTokens: [] }`.
    - `loadConfig` con `FIREBASE_SERVICE_ACCOUNT` que no es base64 de un JSON → lanza un error que menciona la variable.
  - `notifications.test.ts`, con `fakeRealtime` y `fakePush`, más un usuario con 2 tokens:
    - **En línea:** emite y no hay push.
    - **Fuera de línea:** push a los 2 tokens con el texto y el `link`, sin emisión.
    - **`push: false`:** sin push.
    - **`quietNight: true`** con `now` a las 23:00 de Lima: sin push. A las 12:00: con push.
    - **Categoría apagada:** ni emisión ni push, pero se guarda la fila.
    - **Token inválido:** `fakePush.invalid` con un token borra ese `DeviceToken` y deja el otro.
    - **Firebase falla:** con `fakePush.fail = true`, `POST /conversations/:id/messages` responde 201 igual.
  - `devices.test.ts`:
    - Registrar devuelve 204 y registrar dos veces el mismo token deja 1 fila.
    - El mismo token registrado por otra cuenta pasa a la otra.
    - `DELETE` de un token ajeno devuelve 204 y no lo borra; el propio lo borra.
    - Plataforma inválida → 400. Sin token → 401.
    - `POST /devices/test` → 202; con `vi.useFakeTimers` y avanzando 10 s, `fakePush.sent` tiene el aviso de prueba.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** `npm test` y `npm run typecheck`: PASS. **Step 5: Commit** con `git commit -m "Servidor: push con Firebase, horario silencioso y /devices"`.

---

### Task 2: Servidor listo para producción

**Files:**
- Create: `render.yaml` (raíz)
- Modify: `server/package.json`, `server/src/config.ts`, `server/src/index.ts`, `server/.env.example`, `server/README.md`
- Test: `server/test/app.test.ts` (o `config.test.ts` si existe)

**Interfaces:**
- `server/package.json`:
  - script `start:prod`: `prisma migrate deploy && prisma db seed && node dist/index.js`. El seed es idempotente y crea los bots y sus materiales en una base vacía.
  - `tsx` pasa a `dependencies`, porque el seed lo usa en producción.
  - `"engines": { "node": ">=22" }`.
- `loadConfig`: con `NODE_ENV=production`, avisa por consola (`console.warn`, sin fallar) si falta `CLOUDINARY_URL`, porque el disco de Render se borra en cada despliegue, o si no hay correo configurado.
- `render.yaml`: un web service `ecoestudiante-api` con:
  - `rootDir: server`, `runtime: node`, `plan: free`;
  - `buildCommand: npm ci && npx prisma generate && npm run build`;
  - `startCommand: npm run start:prod`;
  - `healthCheckPath: /api/health`;
  - `envVars` con `sync: false` para los secretos (`DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`, `SMTP_*` o `RESEND_API_KEY`, `MAIL_FROM`, `FIREBASE_SERVICE_ACCOUNT`), `BOTS_ENABLED=true` y `NODE_ENV=production`;
  - `CORS_ORIGINS`: `https://localhost,capacitor://localhost,http://localhost:5173`. Agrega la URL de la PWA si se publica.

- [ ] **Step 1: Pruebas que fallan.** `loadConfig({ NODE_ENV: 'production', ... })` sin `CLOUDINARY_URL` llama a `console.warn` con un texto que menciona `CLOUDINARY_URL`. En desarrollo no avisa.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** `npm test`, `npm run build` y luego `node dist/index.js` con la base local: `GET /api/health` → 200. **Step 5: Commit** con `git commit -m "Servidor: listo para Render (start:prod, render.yaml y avisos de producción)"`.

---

### Task 3: App: preferencias en el servidor y push en Android

**Files:**
- Create: `src/lib/push.ts`
- Modify: `package.json` (`npx pnpm@10.34.3 add @capacitor/push-notifications@^8`), `src/lib/types.ts` (`User.notificationPrefs?`), `src/lib/store.ts`, `src/lib/settings.ts`, `src/lib/alerts.ts`, `src/lib/socket.ts`, `src/App.tsx`, `src/screens/Settings.tsx`, `android/.gitignore` (`app/google-services.json`)

**Interfaces:**
- `store.ts`:
  - `adoptUser` guarda `notificationPrefs` del `MeDto`.
  - `updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<boolean>` es optimista: aplica el cambio en la caché, llama a `PATCH /users/me` y, si falla, revierte y muestra el error.
  - `logout()` ahora es `async`: primero `unregisterPush()` y después borra el token de sesión.
- `settings.ts`: se eliminan `system`, `quietNight` y `categories` del ajuste local. `popup`, `sound`, `vibrate`, `volume` y accesibilidad siguen locales.
  - Los ajustes locales guardados de antes se ignoran sin errores.
  - `alertInApp` lee categoría y horario silencioso de `currentUser(state).notificationPrefs` (si falta, todo activo).
- `push.ts`, que solo actúa en la plataforma nativa (en la web no hace nada):
  - `registerPush(): Promise<void>`: pide permiso con `PushNotifications.requestPermissions()`. Si se concede, llama a `register()`. En el evento `registration`, hace `POST /devices { token, platform: 'android' }` y guarda el token en memoria.
  - En `pushNotificationActionPerformed`, ejecuta `navigate(notification.data.link)`.
  - `unregisterPush(): Promise<void>`: `DELETE /devices/:token` si hay token. Ignora los errores de red.
- `socket.ts` y `App.tsx`: en nativo, `App.addListener('appStateChange')`:
  - al pasar a segundo plano, `disconnectSocket()`, así el servidor envía push;
  - al volver, `connectSocket(token)`, que ya sincroniza todo.
- `alerts.ts`: se eliminan `postNow`, `handedToSystem`, `alertUnlessShown`, `testSystemNotification(seconds > 0)`, la comprobación de alarmas exactas y el `subscribe` que publicaba avisos en segundo plano. Se mantienen los canales (el push usa `eco-sonido-vibra`), `alertInApp`, el permiso y la prueba inmediata.
- `Settings.tsx`:
  - **"Avisos con la app cerrada":** usa `notificationPrefs.push` más el permiso de Android.
  - **"Silenciar de noche":** usa `notificationPrefs.quietNight`; texto: "Sin avisos ni sonido de 10:00 p. m. a 7:00 a. m.".
  - **Categorías:** usan `notificationPrefs.categories`.
  - **"Paso 2: probar con la app cerrada":** llama a `POST /devices/test` y muestra el toast "Cierra la app ahora: el aviso llegará en 10 segundos."
  - Mientras guarda, el interruptor queda deshabilitado.

- [ ] **Step 1: Implementar.** **Step 2:** `npx tsc --noEmit -p .` y `npx vite build`, sin errores.
- [ ] **Step 3: Verificar en el navegador**, sin push porque es la web:
  - cambiar una categoría la guarda en el servidor (`GET /auth/me`) y se mantiene al recargar;
  - con "Mensajes" apagado, un mensaje de un bot no abre la ventana emergente, pero queda en la lista de notificaciones;
  - cerrar sesión funciona aunque el servidor esté apagado.
- [ ] **Step 4: Commit** con `git commit -m "App: preferencias de notificación en el servidor y push de Android"`.

---

### Task 4: Cuentas y claves (lo haces tú, con mi guía)

No es código: creas las cuentas gratuitas y me pasas cada valor **por un archivo `.env` local o pegándolo cuando lo
pida**; nunca va a git. Para cada una te indico exactamente dónde está en su panel.

- [ ] **Firebase:**
  - crear el proyecto;
  - agregar una app Android con el paquete `com.ecoestudiante.app`;
  - descargar `google-services.json` a `android/app/`;
  - en *Configuración › Cuentas de servicio*, "Generar nueva clave privada"; el JSON se codifica en base64 para `FIREBASE_SERVICE_ACCOUNT`.
- [ ] **Neon:** crear el proyecto `ecoestudiante` y copiar la cadena de conexión *pooled* con `sslmode=require` para `DATABASE_URL`.
- [ ] **Cloudinary:** copiar `CLOUDINARY_URL` de *Settings › API Keys*.
- [ ] **Correo:** Gmail con verificación en 2 pasos y una *contraseña de aplicación* para `SMTP_*`, o Resend si tienes un dominio propio.
- [ ] **Render:** cuenta conectada a GitHub con acceso a `NotAlex456/EcoEstudiante`.
- [ ] **Verificación local:** con esos valores en `server/.env`, `npm run dev` contra Neon envía un correo real de verificación y sube una foto a Cloudinary. Con el APK de depuración, el push de prueba llega con la app cerrada.

---

### Task 5: Despliegue en Render + Neon

Se hace **después de mergear los PR #1 a #3 y el de esta etapa**, para desplegar desde `main`. Si aún no se mergean,
se despliega temporalmente desde la rama `backend-etapa-5` y se cambia después.

- [ ] En Render, crear el servicio desde `render.yaml` (*New › Blueprint*) y cargar los secretos de la Task 4. `JWT_SECRET` se genera con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- [ ] El primer despliegue aplica las migraciones y el seed; en los registros aparecen `migrate deploy` y el seed sin errores.
- [ ] Pruebas contra la URL pública (`https://ecoestudiante-api.onrender.com` o la que asigne Render):
  - `GET /api/health` → 200;
  - `GET /api/materials` lista los 7 materiales de ejemplo;
  - registro con un correo `@upsjb.edu.pe` real: llega el código y se verifica;
  - Socket.IO conecta desde Node con ese token;
  - escribirle a María: responde en menos de 10 s.

---

### Task 6: APK 2.0 y prueba en un celular real

**Files:**
- Create: `.env.production` (`VITE_API_URL=https://<servicio>.onrender.com`; no es secreto)
- Modify: `android/app/build.gradle` (`versionCode 5`, `versionName "2.0"`), `package.json` (`"version": "2.0.0"`)

- [ ] `npx pnpm android:apk` genera `android/app/build/outputs/apk/release/app-release.apk` firmado.
- [ ] En un celular real (lo instalas tú; yo te guío):
  1. Primera apertura con Render dormido: aparece "Conectando con el servidor…" y luego la app.
  2. Registro, verificación con el código del correo real y Android pide permiso de notificaciones.
  3. Publicar con una foto de la cámara: la foto queda en Cloudinary.
  4. Escribirle a María y **cerrar la app**: llega la notificación de Android con la respuesta, y al tocarla se abre ese chat.
  5. Con la app abierta: los avisos llegan como ventana emergente y no como notificación de Android.
  6. "Silenciar de noche" activado a las 22:00 o más tarde, o cambiando la hora del servidor en la prueba: no llega push.
  7. Ajustes › "Paso 2: probar con la app cerrada": llega en 10 s.
  8. Dos celulares (o celular + navegador), cada uno con una cuenta, completan una entrega de punta a punta.
- [ ] Publicar `EcoEstudiante-2.0.apk` en *Releases* de GitHub, **solo con tu confirmación**, porque es contenido público.
- [ ] Commit con `git commit -m "APK 2.0 apuntando al servidor en internet"`.

---

### Task 7: Documentación final

- [ ] Actualizar:
  - `docs/backend-explicado.md`:
    - estado: las 5 etapas;
    - §7.5 con la rama del push (por qué la app cierra el socket en segundo plano);
    - §11 con el despliegue real (URL, servicios, cómo actualizar);
    - §13 con las limitaciones: Render se duerme, sin push en la web y Neon gratuito;
    - preguntas probables: "¿cómo llega un aviso con la app cerrada?" y "¿dónde están las claves?".
  - El spec, §9: etapa 5 hecha, y las desviaciones `/api/health`, push solo Android y `start:prod` con seed.
  - `README.md` (raíz): descarga del APK 2.0, URL del servidor y cómo correr todo en local.
  - `ANDROID.md`: `google-services.json`, la versión 2.0 y que los datos ya no viven en el celular.
  - `server/README.md`: despliegue en Render paso a paso.
- [ ] Commit con `git commit -m "Docs: etapa 5 (push y despliegue)"`.

---

## Decisiones de este plan (para aprobar)

1. **El socket se cierra al pasar a segundo plano en Android.**
   - Así "no conectado" equivale a "debe recibir push", sin ventanas en las que el servidor cree que sigues en línea.
   - Reemplaza las notificaciones locales que publicaba la app en segundo plano.
2. **Push solo en Android (APK).** La PWA en el navegador sigue recibiendo avisos solo con la app abierta. El push web necesita VAPID y un *service worker* propio, y no aporta a la demo. Queda como limitación anotada.
3. **Un solo canal para el push** (`eco-sonido-vibra`). El servidor no conoce los ajustes locales de sonido y vibración; el horario silencioso del servidor cubre la noche.
4. **El seed corre en cada arranque de producción.** Es idempotente y deja la demo lista en una base nueva de Neon sin pasos manuales.
5. **El health check queda en `/api/health`** (el spec decía `/health`), igual que en local.
