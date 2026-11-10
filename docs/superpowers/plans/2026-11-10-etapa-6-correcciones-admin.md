# Etapa 6 (correcciones, recuperación de contraseña y panel de administrador): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir las observaciones de la prueba en el celular, abrir el registro a correos de confianza, agregar
la recuperación de contraseña y un panel web de administración en `/admin`.

**Architecture:**
- **Datos:** una migración `etapa6` vuelve texto la categoría y agrega `role`, `tokenVersion`, `blockedAt`,
  `moderatedAt`, `EmailCode.purpose`, la resolución de reportes y `ModerationLog`.
- **Sesiones:** `requireAuth` y el socket comprueban `tokenVersion` y el bloqueo en cada petición.
- **Moderación:** vive en `modules/admin`, que reutiliza los servicios de materiales y acuerdos.
- **Panel:** una app React pequeña en `server/admin-web/` que Express sirve compilada en `/admin`.
- **App de estudiantes:** gana `Select`, `PasswordInput` y `Autocomplete` propios, y las pantallas de recuperación.

**Tech Stack:** lo de las etapas anteriores. El panel usa React 19 + Vite, como `devDependencies` del servidor.

**Spec:** `docs/superpowers/specs/2026-11-10-etapa-6-correcciones-admin-design.md` (y la base `2026-11-09-backend-design.md`).

## Global Constraints

- Errores en español con `{ error: { code, message } }`, `.strict()` en los cuerpos y pruebas antes del código.
- Mensaje de correo no permitido: el mismo de siempre, `'Usa tu correo institucional (nombre.apellido@upsjb.edu.pe).'`.
- Categoría: de 2 a 40 caracteres, normalizada con `normalizeCategory`. Curso: de 2 a 80 caracteres.
- Carreras: exactamente las 10 del spec §2.4, en ese orden.
- Bloqueo: login → 403 `ACCOUNT_BLOCKED` con el texto del spec §3.4; token vigente → 401 `UNAUTHENTICATED`.
- Admin: toda ruta `/api/admin/*` sin rol admin → 403 `FORBIDDEN`, `'No tienes acceso al panel de administración.'`.
- En la raíz, las dependencias se instalan con `npx pnpm@10.34.3 add …`; en `server/`, con `npm install`.
- Ningún secreto en git. Las variables nuevas (`ALLOWED_EMAILS`, `ADMIN_EMAILS`) van en `.env.example` y en `render.yaml` con `sync: false`.

## Review Focus

1. **Un usuario bloqueado con la app abierta:** su próxima petición da 401, su socket se corta y sus publicaciones desaparecen para los demás, también desde los perfiles y los guardados. Pruebas en la Task 2 y la Task 4.
2. **Un código de verificación usado para recuperar la contraseña (o al revés):** se rechaza. Prueba en la Task 3.
3. **Un administrador se quita de `ADMIN_EMAILS`:** en su próximo ingreso deja de serlo, y su sesión vigente pierde el acceso a `/api/admin`, porque el rol se lee de la base en cada petición. Prueba en la Task 2.
4. **Categorías escritas distinto** ("libros", "LIBROS ", "Libros"): quedan como una sola, en el filtro, las sugerencias, las tarjetas de Explorar y las alertas de búsqueda. Pruebas en la Task 1.
5. **El dueño de una publicación oculta por moderación** intenta reactivarla o editarla: recibe 409 `MODERATED`; sí puede eliminarla. Prueba en la Task 4.

---

### Task 1: Categoría y curso libres, sugerencias y carreras nuevas

**Files:**
- Create: `shared/text.ts` (`normalizeCategory`, `foldText`), `server/prisma/migrations/<fecha>_etapa6/migration.sql` (generada con `prisma migrate dev --create-only` y luego editada), `server/test/categories.test.ts`
- Modify: `server/prisma/schema.prisma` (todos los campos de la migración del spec §3.1, para hacer una sola migración), `shared/constants.ts` (`CAREERS` nuevas; sin `COURSES`; `CATEGORIES` pasa a llamarse `SEED_CATEGORIES`), `shared/search.ts`, `shared/seed-data.ts` (carrera "Administración de Empresas"), `server/src/modules/materials/{schemas,service,routes,dto}.ts`, `server/src/modules/saved/routes.ts`, `server/src/enums.ts` (sin categoría)

**Interfaces:**
- `normalizeCategory(text: string): string`: recorta, une espacios dobles y deja la primera letra en mayúscula y el resto en minúscula.
- `foldText(text: string): string`: minúsculas y sin tildes (NFD menos las marcas diacríticas), para comparar.
- `GET /api/materials/suggestions` → `{ categories: { name: string; count: number }[]; courses: string[] }`:
  - `categories`: las de materiales `Disponible`, ordenadas por cantidad (máximo 30);
  - `courses`: los distintos (máximo 100).
- `matchesSearch` y el filtro `GET /materials?category=` comparan con `foldText`.
- Las búsquedas guardadas aceptan `category: 'Todos' | string (2–40)`.
- La migración (SQL editado a mano):
  - `ALTER TABLE "Material" ALTER COLUMN category TYPE TEXT USING category::text` y `DROP TYPE "Category"`;
  - `UPDATE "User"` y `UPDATE "Material"` con `SET career='Administración de Empresas' WHERE career='Administración'`;
  - además, las columnas y la tabla nuevas de las tasks 2 a 4.

- [ ] **Step 1: Pruebas que fallan** (`categories.test.ts`):
  - `normalizeCategory('  kit  de LABORATORIO ')` → `'Kit de laboratorio'`;
  - publicar con categoría `'bata de laboratorio'` guarda `'Bata de laboratorio'`;
  - una categoría de 1 o de 41 caracteres → 400;
  - `GET /materials?category=LIBROS` encuentra las de `'Libros'`;
  - `matchesSearch` con `'Calculadoras'` frente a `'calculadoras'` → true;
  - `suggestions` ordena por cantidad y no incluye pausados;
  - registrarse con la carrera `'Medicina Humana'` → 201 y con `'Administración'` → 400;
  - la búsqueda guardada con `category: 'Uniformes'` → 201.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar** (schema + migración + código). **Step 4:** `npm test` y `npm run typecheck`: PASS. Si una prueba antigua usa una carrera eliminada, se actualiza al valor nuevo. **Step 5: Commit** con `git commit -m "Servidor: categoría y curso libres, sugerencias y carreras de la filial Chincha"`.

---

### Task 2: Correos permitidos, roles, `tokenVersion` y bloqueo

**Files:**
- Create: `server/test/access.test.ts`
- Modify: `server/src/config.ts` (`allowedEmails: string[]` y `adminEmails: string[]`, en minúsculas), `server/src/modules/auth/{schemas,service,tokens}.ts`, `server/src/middleware/auth.ts`, `server/src/realtime/socket.ts` (`disconnectUser(userId)`), `server/src/modules/users/dto.ts` (`MeDto.role`), `server/test/helpers.ts`, `.env.example` y `render.yaml`

**Interfaces:**
- **Correo permitido:** `email` del registro pasa a ser un email válido cualquiera. El servicio comprueba `INSTITUTIONAL_EMAIL.test(email) || config.allowedEmails.includes(email)`; si no, 400 `VALIDATION` con `fields.email` = el mensaje de siempre.
- **Tokens:** `signToken(userId, version, secret)`. `verifyToken` devuelve `{ userId, version } | null`.
- **`requireAuth` y `optionalAuth`:** buscan `{ id, verified, tokenVersion, blockedAt, role }`. Solo aceptan si está verificado, `version === tokenVersion` y `blockedAt` es nulo. Dejan `req.user = { id, role }`.
- **`requireAdmin(config)`:** `requireAuth` más 403 si `role !== 'admin'`.
- **Login:** con `blockedAt` → 403 `ACCOUNT_BLOCKED`. Al hacer login y al verificar, `role` = `adminEmails.includes(email) ? 'admin' : 'student'`.
- **Socket:** el middleware aplica las mismas reglas. `Realtime.disconnectUser(userId: string): void` desconecta todos los sockets de esa sala; `fakeRealtime` lo registra en `disconnected: string[]`.

- [ ] **Step 1: Pruebas que fallan** (`access.test.ts`):
  - con `allowedEmails: ['novio@gmail.com']`, `novio@gmail.com` se registra (201) y `otro@gmail.com` → 400 con el mensaje de siempre;
  - con `adminEmails` que incluye a Ana: tras login, `GET /auth/me` → `role: 'admin'`; quitando la lista y volviendo a entrar → `'student'`;
  - un token con la versión anterior (subir `tokenVersion` en la base) → 401;
  - con `blockedAt`: el login → 403 `ACCOUNT_BLOCKED` y el token vigente → 401;
  - `requireAdmin` con un estudiante → 403 con el texto exacto;
  - el socket de un usuario bloqueado es rechazado con `UNAUTHENTICATED` (en `realtime.test.ts`).
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** `npm test` y `npm run typecheck`: PASS. **Step 5: Commit** con `git commit -m "Servidor: correos permitidos, rol de administrador y sesiones revocables"`.

---

### Task 3: Recuperación de contraseña

**Files:**
- Create: `server/test/reset.test.ts`
- Modify: `server/src/modules/auth/{schemas,service,routes}.ts`, `server/src/integrations/mail.ts` (`sendPasswordResetCode(to, name, code)`, con el asunto `Tu código para cambiar la contraseña: <code>`)

**Interfaces:**
- **`POST /api/auth/forgot { email }`** → 200 `{ ok: true, devCode? }` siempre.
  - Solo envía si el usuario existe, está verificado, no es bot y no está bloqueado.
  - Reutiliza `issueCode(user, ctx, …, 'reset')`, con 1 por minuto.
  - `devCode` solo en modo consola.
- **`POST /api/auth/reset { email, code, password }`** → 200 `{ token, user }`.
  - Toma el `EmailCode` `purpose: 'reset'` más reciente y aplica el mismo reclamo atómico de intentos de `verify`.
  - Si es correcto, en una transacción: guarda el hash, hace `tokenVersion++` y borra los códigos `reset`.
  - Errores: `INVALID_CODE`, `CODE_EXPIRED` y `TOO_MANY_ATTEMPTS`, iguales a `verify`. La contraseña se valida igual que en el registro.
- **`verify`** filtra y borra solo los códigos `purpose: 'verify'`.

- [ ] **Step 1: Pruebas que fallan:**
  - `forgot` con un correo inexistente → 200 `{ ok: true }` y no se envía nada;
  - con uno existente → 200 y el mailer recibe el código;
  - `reset` con ese código → 200, la sesión anterior → 401 y el token nuevo funciona en `/auth/me`;
  - el código del registro usado en `reset` → 400 `INVALID_CODE`;
  - 6 intentos con un código malo → el sexto da 429;
  - un código vencido → 400 `CODE_EXPIRED`;
  - una contraseña de 7 caracteres → 400.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** PASS. **Step 5: Commit** con `git commit -m "Servidor: recuperación de contraseña con código por correo"`.

---

### Task 4: Moderación y API de administración

**Files:**
- Create: `server/src/modules/admin/{service,routes}.ts`, `server/test/admin.test.ts`
- Modify: `server/src/app.ts`, `server/src/modules/materials/service.ts`
  - Los listados públicos, detalle, perfil, guardados y sugerencias excluyen a los dueños con `blockedAt`.
  - `setStatus` y `update` responden 409 `MODERATED` si hay `moderatedAt`.
  - `remove` queda reutilizable sin exigir ser el dueño: `removeAsAdmin`.
- Modify: `server/src/modules/materials/dto.ts` (`moderated: boolean` solo para el dueño)

**Interfaces:** las rutas y funciones del spec §3.6 y §4.1, con estos tipos:
- `AdminMaterialDto = MaterialDto & { moderatedAt: string | null; owner: OwnerDto & { email: string; blocked: boolean } }`
- `AdminReportDto = { id, reason, detail, createdAt, resolvedAt, resolution, material: AdminMaterialDto, reporter: { id, name, email } }`
- `AdminUserDto = { id, name, email, career, cycle, role, blocked: boolean, createdAt, materials: number, rating }`
- Paginación de 20 en 20: `{ items, hasMore }`.
- `/api/admin/log` devuelve `{ id, action, targetId, reason, createdAt, admin: { id, name } }[]`.

- [ ] **Step 1: Pruebas que fallan** (`admin.test.ts`, con Ana como admin vía `adminEmails`, Beto y Carla estudiantes):
  - un estudiante recibe 403 en las 10 rutas;
  - `stats` → los números esperados;
  - `hide` sobre un material con un acuerdo `Confirmado`: queda `Pausado` con `moderatedAt`, el acuerdo `Cancelado`, se avisa a ambos y hay una fila en `ModerationLog`;
  - el dueño hace `PATCH status Disponible` → 409 `MODERATED`; `DELETE` → 204;
  - `restore` → `Disponible` y `moderatedAt` nulo;
  - `resolve hidden` con 2 reportes del mismo material → ambos resueltos;
  - `resolve dismissed` → solo ese;
  - `block` a Beto: sus materiales desaparecen de `GET /materials`, de `GET /materials/:id` (404) y de `/saved` de Carla, y `realtime.disconnected` lo incluye;
  - `unblock` → reaparecen;
  - bloquear a otro admin o a uno mismo → 409;
  - `users` no lista bots;
  - `materials?status=Eliminado` lista los eliminados.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** PASS. **Step 5: Commit** con `git commit -m "Servidor: moderación y API del panel de administración"`.

---

### Task 5: Panel web `/admin`

**Files:**
- Create: `server/admin-web/{index.html,vite.config.ts,tsconfig.json}`, `server/admin-web/src/{main.tsx,App.tsx,api.ts,styles.css}`, `server/admin-web/src/views/{Login,Summary,Materials,Reports,Users}.tsx`
- Modify: `server/package.json`:
  - `devDependencies`: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `vite` y `@vitejs/plugin-react`;
  - script `build:admin` = `vite build --config admin-web/vite.config.ts`;
  - `build` = `tsup && npm run build:admin`.
- Modify: `server/src/app.ts`: `express.static(dist-admin)` en `/admin`, con `X-Frame-Options: DENY`, y fallback de `/admin/*` a su `index.html`. Si `dist-admin` no existe (pruebas), no se monta.
- Modify: `.gitignore` (`server/dist-admin/`)
- Test: `server/test/app.test.ts`: `GET /admin` sirve HTML cuando existe la carpeta. La prueba crea una carpeta temporal y la pasa por `config.adminDir`.

**Interfaces:**
- `admin-web/src/api.ts`:
  - `api(method, path, body?)` usa el mismo origen (`/api`) y el token de `sessionStorage['eco-admin-token']`;
  - un 401 o un 403 vuelven al login.
- Vistas:
  - **Login:** con `PasswordInput` propio; rechaza `role !== 'admin'` con "No tienes acceso al panel de administración.".
  - **Summary:** 4 tarjetas + últimas publicaciones + reportes pendientes + acciones.
  - **Materials:** tabla, búsqueda, filtro de estado, Ocultar (motivo opcional) / Restaurar / Eliminar con `confirm` propio.
  - **Reports:** pestañas Pendientes / Resueltos.
  - **Users:** búsqueda y Bloquear / Desbloquear.
- Estilo: colores de la app (`#176B4B` principal, fondo `#f5f7f3`), menú lateral; en menos de 768 px, menú superior.

- [ ] **Step 1: Implementar** (el panel es interfaz; su lógica de datos ya está probada en la Task 4) y escribir la prueba de `GET /admin` que falla primero.
- [ ] **Step 2:** `npm run build` en `server/` genera `dist/` y `dist-admin/`. `npm test` PASS.
- [ ] **Step 3: Verificar en el navegador** con el servidor local y `ADMIN_EMAILS` con una cuenta de prueba:
  - entrar con un estudiante → rechazado;
  - entrar como admin → ver el resumen;
  - ocultar y restaurar una publicación;
  - resolver un reporte;
  - bloquear y desbloquear a Beto (con el script de API);
  - en un celular, verlo en vista angosta.
- [ ] **Step 4: Commit** con `git commit -m "Panel web de administración en /admin"`.

---

### Task 6: App: selector propio, ver contraseña, botones fijos, textos libres y recuperación

**Files:**
- Modify: `src/components/ui.tsx` (`Select`, `PasswordInput`, `Autocomplete`), `src/app.css` y `src/index.css`, `src/App.tsx` (`--mobile-nav-h` con `ResizeObserver` y ocultar la barra con el teclado abierto vía `visualViewport`)
- Modify: `src/screens/{Auth,Account,Agreement,Explore,Publish,Activity}.tsx`, `src/lib/{data,types,store,sync}.ts`
- Create: `src/screens/ForgotPassword.tsx` (ruta `#/recuperar`; `src/lib/router.ts`)

**Interfaces:**
- **`Select<T extends string | number>`**:
  - props `{ label; value: T; options: { value: T; label: string }[]; onChange(v: T): void; disabled? }`;
  - en menos de 768 px abre una hoja inferior; en pantallas anchas, una lista desplegable;
  - teclado, ARIA y foco como en el spec §2.2.
- **`PasswordInput`**: props de `<input>` sin `type`; botón con `aria-label` "Mostrar contraseña" / "Ocultar contraseña" y `aria-pressed`.
- **`Autocomplete`**:
  - props `{ label; value; onChange; suggestions: string[]; maxLength; placeholder }`;
  - muestra hasta 6 coincidencias comparando con `foldText`;
  - es un `<input>` con `role="combobox"` y una lista con `role="listbox"`.
- **`sync.ts`**: `loadSuggestions(): Promise<{ categories; courses }>`, que se guarda en caché en memoria.
- **`store.ts`**:
  - `forgotPassword(email)` → `Failure | { ok: true; devCode? }`;
  - `resetPassword(email, code, password)` → `Failure | { ok: true }`, que guarda el token y adopta al usuario.
- **Explorar:**
  - las tarjetas usan las 6 primeras de `suggestions.categories`, completadas con `SEED_CATEGORIES`;
  - icono por categoría conocida y `tag` genérico para el resto.
- **Mi actividad:** una publicación con `moderated` muestra la etiqueta "Oculta por moderación" y oculta los botones Reactivar y Editar.

- [ ] **Step 1: Implementar.** **Step 2:** `npx tsc --noEmit -p .` y `npx vite build`, sin errores.
- [ ] **Step 3: Verificar en el navegador** (vista móvil de 375 px):
  - ningún `<select>` queda en `src/` (`grep`);
  - cada selector se abre como hoja, elige con clic y con teclado, y se cierra con Escape;
  - 👁 en registro, ingreso y recuperación;
  - Publicar con curso y categoría libres y sugerencias;
  - Explorar con una categoría nueva que aparece como tarjeta;
  - recuperación completa en modo consola;
  - los botones fijos de Detalle y Publicar, sin hueco, en vistas de 360, 375 y 412 px.
- [ ] **Step 4: Commit** con `git commit -m "App: selector propio, ver contraseña, textos libres, recuperación y botones sin hueco"`.

---

### Task 7: Despliegue, APK 2.1 y documentación

- [ ] **Variables y versión:**
  - `render.yaml` y `.env.example`: `ALLOWED_EMAILS` y `ADMIN_EMAILS` (`sync: false`);
  - `android/app/build.gradle` → `versionCode 7`, `versionName "2.1"`.
- [ ] **Documentación:**
  - `docs/backend-explicado.md`: moderación, sesiones revocables, recuperación, categorías libres, panel `/admin`, tablas nuevas y preguntas probables;
  - `README.md`: panel y correos permitidos;
  - `server/README.md`: variables nuevas.
- [ ] Commit con `git commit -m "Docs y versión 2.1: etapa 6"`.
- [ ] **Con el visto bueno del usuario:** subir la rama, cargar `ADMIN_EMAILS` (su correo) y `ALLOWED_EMAILS` (el correo de su novio) en Render y verificar contra la URL pública:
  - `/admin` carga;
  - `/api/materials/suggestions` responde.
- [ ] **APK 2.1:** `npx pnpm android:sync` + `gradlew.bat assembleRelease`. En el celular del usuario: sin hueco sobre la barra en Detalle y Publicar, teclado en Publicar, selectores propios y 👁.
