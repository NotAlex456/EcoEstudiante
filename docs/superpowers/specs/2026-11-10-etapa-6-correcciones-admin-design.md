# Etapa 6: correcciones de la app, recuperación de contraseña y panel de administrador

**Fecha:** 2026-11-10 · **Estado:** diseño aprobado por partes en la conversación; pendiente de revisión del documento.

**Base:** todo lo de `2026-11-09-backend-design.md` (etapas 1 a 5) sigue vigente. Este documento solo describe lo
que cambia o se agrega.

## 1. Objetivo

Corregir las observaciones de la prueba en un celular real (documento "Correcciones App EcoEstudiantes"), permitir
que personas de confianza sin correo institucional prueben la app, agregar la recuperación de contraseña y dar al
administrador una página web propia para moderar publicaciones, reportes y usuarios.

**Criterios de éxito:**

1. Los botones fijos de Detalle y Publicar quedan pegados a la barra inferior, sin hueco, en cualquier celular.
2. Ninguna lista desplegable usa el menú del sistema: todas tienen el estilo de la app.
3. Todo campo de contraseña tiene el botón para verla.
4. Curso y categoría se escriben libremente, con sugerencias. La app ya no se limita a cuatro tipos de material.
5. Las carreras son las 10 de la filial Chincha.
6. Un correo de la lista `ALLOWED_EMAILS` puede registrarse aunque no sea `@upsjb.edu.pe`.
7. Se puede recuperar la contraseña con un código enviado por correo.
8. Un administrador entra a `/admin` y puede ocultar, restaurar o eliminar publicaciones, resolver reportes y
   bloquear o desbloquear usuarios. Un estudiante no puede.

## 2. App de estudiantes

### 2.1 Botones fijos sin hueco

- **Causa:** `.detail__actions` y `.form-actions` usan `bottom: calc(70px + safe-area)`, una altura estimada de la
  barra inferior (`.mobile-nav`). En celulares donde la barra mide más (Android con botones de navegación), queda un
  hueco por el que se ve el contenido.
- **Solución:**
  - La barra inferior publica su altura real en la variable CSS `--mobile-nav-h`, medida con un `ResizeObserver` en
    `App.tsx`.
  - Los botones fijos usan `bottom: var(--mobile-nav-h)`.
- **Con el teclado abierto** (se detecta porque `visualViewport` se achica más de 150 px), la barra inferior se oculta
  y los botones fijos bajan a `bottom: 0`.

### 2.2 Selector propio en lugar de `<select>`

- **Componente:** `Select` en `src/components/ui.tsx`.
  - Props: `value`, `onChange`, `options: { value, label }[]`, `label`, `placeholder?`, `disabled?`.
  - En pantallas angostas (menos de 768 px) abre una **hoja inferior**: panel desde abajo con fondo atenuado, título,
    opciones grandes y la elegida marcada en verde.
  - En pantallas anchas abre una **lista desplegable** bajo el campo.
- **Accesibilidad:**
  - El botón tiene `aria-haspopup="listbox"` y la lista `role="listbox"` con opciones `role="option"`.
  - Teclado: flechas, Enter, Escape e inicio por letra.
  - El foco vuelve al botón al cerrar.
  - Respeta "Reducir animaciones".
- **Dónde se usa:** reemplaza todos los `<select>` de la app:
  - Auth (carrera y ciclo);
  - Account (perfil);
  - Agreement (punto seguro);
  - Explore (filtros de carrera, ciclo, estado y orden);
  - Publish (carrera y ciclo).

### 2.3 Ver la contraseña

- **Componente:** `PasswordInput` en `ui.tsx`. Es un `<input>` con un botón 👁 dentro, que alterna entre
  `type="password"` y `type="text"`.
- **Botón:** etiqueta accesible "Mostrar contraseña" / "Ocultar contraseña" y `aria-pressed`.
- **Dónde se usa:** en registro (dos campos), ingreso y recuperación.

### 2.4 Carreras

`shared/constants.ts` → `CAREERS`, en este orden:

Medicina Humana, Enfermería, Psicología, Tecnología Médica – Laboratorio Clínico y Anatomía Patológica,
Tecnología Médica – Terapia Física y Rehabilitación, Derecho, Administración de Empresas, Contabilidad,
Ingeniería de Sistemas, Ingeniería Agroindustrial.

- Se elimina `COURSES`, la lista de cursos por carrera.
- Las carreras de los datos de ejemplo se ajustan a esta lista: "Administración" pasa a "Administración de Empresas".

### 2.5 Curso y categoría con texto libre

- **Publicar:**
  - Curso y categoría son campos de texto con **sugerencias** (componente `Autocomplete`): al escribir aparecen hasta
    6 coincidencias de `GET /api/materials/suggestions`, sin distinguir mayúsculas ni tildes.
  - Elegir una sugerencia completa el campo, pero se puede escribir cualquier otra cosa.
- **Curso:** de 2 a 80 caracteres.
- **Categoría:** de 2 a 40 caracteres. Se normaliza igual en la app y en el servidor (`shared/text.ts` →
  `normalizeCategory`): recorta los espacios, une los dobles y pone mayúscula en la primera letra y el resto en
  minúscula. Ejemplo: `"  kit  de LABORATORIO "` → `"Kit de laboratorio"`.
- **Explorar:**
  - Las tarjetas "¿Qué estás buscando?" muestran las **6 categorías con más materiales disponibles**. Si hay menos de
    6, se completan con las de ejemplo.
  - El filtro de categoría es una lista armada con las categorías disponibles.
  - "Alertas de búsqueda" guarda la categoría como texto.

### 2.6 Recuperar la contraseña

- En "Ingresar" aparece el enlace **"¿Olvidaste tu contraseña?"**, que abre una pantalla de dos pasos:
  1. **Correo:** al pulsar "Enviar código" aparece siempre "Si existe una cuenta con ese correo, te enviamos un
     código.", exista o no la cuenta.
  2. **Código y nueva contraseña:** la nueva contraseña se escribe dos veces, con 👁. Al terminar se inicia sesión
     directamente.
- **"Reenviar código"** queda disponible después de 60 s.
- **Errores en español:** código incorrecto, vencido o demasiados intentos, igual que en la verificación del registro.

## 3. Servidor y datos

### 3.1 Migración `etapa6`

| Tabla | Cambio |
|---|---|
| `Material` | `category` pasa del enum `Category` a `String`, conservando los valores actuales. Se elimina el enum `Category`. Índice nuevo en `category` |
| `User` | `role` (`student` \| `admin`, por defecto `student`), `tokenVersion Int @default(0)` y `blockedAt DateTime?` |
| `Material` | `moderatedAt DateTime?` (fue ocultado por un administrador) |
| `EmailCode` | `purpose` (`verify` \| `reset`, por defecto `verify`) |
| `Report` | `resolvedAt DateTime?` y `resolution String?` (`hidden` \| `dismissed`) |
| `ModerationLog` *(nueva)* | `id`, `adminId` → User, `action` (`hide_material` \| `restore_material` \| `delete_material` \| `block_user` \| `unblock_user` \| `dismiss_report`), `targetId`, `reason String?` y `createdAt` |

- La misma migración pasa a "Administración de Empresas" las filas que digan "Administración" en `User.career` y
  `Material.career`.

### 3.2 Categorías y sugerencias

- **Validación (zod):** `category` es un string de 2 a 40 caracteres, normalizado con `normalizeCategory` antes de
  guardar. `course` es un string de 2 a 80 caracteres.
- **Filtros:** en `GET /materials?category=` y en `matchesSearch` (`shared/search.ts`), la categoría se compara
  normalizada y sin tildes.
- **`GET /api/materials/suggestions`** (público) → `{ categories: { name, count }[]; courses: string[] }`:
  - `categories`: las categorías de materiales `Disponible`, ordenadas por cantidad (máximo 30);
  - `courses`: los cursos distintos más usados (máximo 100).

### 3.3 Correos permitidos y administradores

- **`ALLOWED_EMAILS`:** correos separados por comas, sin distinguir mayúsculas. El registro acepta un correo si es
  `@upsjb.edu.pe` **o** está en esa lista.
- **Mensaje de error:** sin cambios ("Usa tu correo institucional @upsjb.edu.pe."), para no revelar que existe una
  lista.
- **`ADMIN_EMAILS`:** igual formato. Al **verificar** el correo o al **iniciar sesión**, si el correo está en la lista
  el usuario pasa a `role = admin`; si no está, vuelve a `student`. Quitarlo de la lista le quita el acceso en su
  próximo ingreso.
- `MeDto` incluye `role`.

### 3.4 Sesiones: `tokenVersion` y bloqueo

- **JWT:** incluye `v: tokenVersion`.
- **`requireAuth`** busca al usuario (`select id, tokenVersion, blockedAt, role`) y responde **401** si no existe,
  si `v` no coincide o si está bloqueado. Así un cambio de contraseña o un bloqueo cierran todas las sesiones al
  instante. Cuesta una consulta por petición, aceptable para este volumen.
- **Socket.IO:** el middleware hace la misma comprobación. Al bloquear a alguien, el servidor desconecta sus sockets
  (`realtime.disconnectUser(id)`).
- **Login de un bloqueado:** 403 `ACCOUNT_BLOCKED`, "Tu cuenta está suspendida. Escribe a la administración si crees
  que es un error."
- **Publicaciones de un bloqueado:** no aparecen en Explorar, ni en Detalle (404 para los demás), ni en su perfil
  público, mientras dure el bloqueo.

### 3.5 Recuperación de contraseña

- **`POST /auth/forgot { email }`** → 200 `{ ok: true }` siempre, exista o no la cuenta.
  - Si el usuario existe, está verificado, no es bot y no está bloqueado, crea un `EmailCode` con `purpose: 'reset'`
    y lo envía con el texto "Tu código para cambiar la contraseña…".
  - Mismo límite de reenvío que el registro (1 por minuto).
  - En modo consola devuelve `devCode`, como el registro.
- **`POST /auth/reset { email, code, password }`:**
  - Mismas reglas que `/verify`: el código de reset más reciente, vence en 15 min, máximo 5 intentos reservados de
    forma atómica, y la contraseña cumple las reglas del registro.
  - Si es correcto: guarda el nuevo hash, sube `tokenVersion`, borra los códigos `reset` y devuelve
    `{ token, user }` (inicia sesión).
- **Separación:** un código `verify` nunca sirve para `reset` ni al revés. `/verify` solo borra los códigos `verify`.
- **Límite:** ambas rutas usan el rate limit de `/auth`.

### 3.6 Moderación (servicio compartido)

Funciones de `modules/admin/service.ts`. Cada una escribe en `ModerationLog`:

- **`hideMaterial(adminId, id, reason?)`:**
  - el material pasa a `Pausado` con `moderatedAt = now`;
  - se cancelan sus acuerdos activos, con aviso a los participantes (`announceCancelled`);
  - se avisa al dueño (`cuenta`): "Un administrador ocultó tu publicación “<título>”.";
  - se emite `material:updated`.
- **`restoreMaterial(adminId, id)`:** vuelve a `Disponible` y limpia `moderatedAt`.
- **`deleteMaterial(adminId, id)`:** igual que `materials.remove` (`Eliminado` si tiene historial, borrado real si
  no), sin exigir ser el dueño.
- **`resolveReport(adminId, reportId, 'hidden' | 'dismissed')`:**
  - `hidden` oculta el material y resuelve **todos** los reportes pendientes de ese material;
  - `dismissed` resuelve solo ese reporte.
- **`blockUser(adminId, userId)` / `unblockUser`:**
  - no se puede bloquear uno mismo ni a otro administrador (409);
  - al bloquear: `blockedAt = now`, sube `tokenVersion` y desconecta sus sockets.

**Reglas para el dueño de un material moderado** (`moderatedAt` no nulo):

- lo ve en "Mis publicaciones" con la etiqueta **"Oculta por moderación"**;
- no puede reactivarlo ni editarlo: `PATCH status` y `PATCH` responden 409 `MODERATED`;
- sí puede eliminarlo.

## 4. Panel de administrador (`/admin`)

### 4.1 Rutas del servidor

Todas requieren sesión y `role = admin`; si no, **403** `FORBIDDEN`, "No tienes acceso al panel de administración."

| Ruta | Respuesta |
|---|---|
| `GET /api/admin/stats` | `{ students, activeMaterials, completedAgreements, pendingReports }` |
| `GET /api/admin/materials?q=&status=&page=` | Todas las publicaciones (incluye pausadas, eliminadas y de bloqueados), 20 por página, con dueño y `moderatedAt` |
| `POST /api/admin/materials/:id/hide` `{ reason? }` · `/restore` · `DELETE /api/admin/materials/:id` | Moderación (§3.6) |
| `GET /api/admin/reports?status=pending\|resolved` | Reportes con material, motivo, detalle y quién reportó |
| `POST /api/admin/reports/:id/resolve` `{ action: 'hidden' \| 'dismissed' }` | §3.6 |
| `GET /api/admin/users?q=&page=` | Usuarios reales (sin bots) con correo, carrera, rol, publicaciones, reputación y `blockedAt` |
| `POST /api/admin/users/:id/block` · `/unblock` | §3.6 |
| `GET /api/admin/log` | Las últimas 50 acciones de moderación |

### 4.2 La página

- **Ubicación:** `server/admin-web/`, una app React + Vite + TypeScript propia, pequeña y separada de la de
  estudiantes.
  - Se compila a `server/dist-admin/` y Express la sirve en `/admin`, con la respuesta a `/admin/*` que devuelve su
    `index.html`.
  - Usa los colores y la tipografía de la app; no comparte código de la app de estudiantes salvo `shared/`.
- **Inicio de sesión:** correo y contraseña contra `POST /api/auth/login`. Si `user.role !== 'admin'`, aparece
  "No tienes acceso" y no se guarda la sesión. El token se guarda en `sessionStorage`: se cierra al cerrar la
  pestaña.
- **Secciones** (menú lateral; en el celular, menú superior):
  1. **Resumen:** 4 indicadores, las 5 últimas publicaciones, los reportes pendientes y las últimas acciones.
  2. **Publicaciones:**
     - tabla con miniatura, título, dueño, categoría, estado y fecha;
     - buscador y filtro de estado;
     - acciones Ocultar / Restaurar / Eliminar, con confirmación y motivo opcional.
  3. **Reportes:** pestañas Pendientes / Resueltos, con los botones "Ocultar publicación" y "Descartar".
  4. **Usuarios:** tabla con buscador y Bloquear / Desbloquear, con confirmación.
- **Estados:** "Cargando…", "No hay nada aquí" y los errores en español del servidor.
- **Mensajes:** todos en español.
- **Seguridad:**
  - el servidor manda la cabecera `X-Frame-Options: DENY` en `/admin`;
  - `/admin` usa la misma API y el mismo origen, así que no necesita CORS.
- **Compilación:**
  - `server/package.json` → `build` compila el servidor y el panel;
  - en Render no cambia nada, porque `npm run build` ya está en el `buildCommand`;
  - las dependencias del panel (react, react-dom, vite y @vitejs/plugin-react) van como `devDependencies` del
    servidor.

## 5. Pruebas

**Servidor (Vitest + Supertest)**, al menos una prueba por regla:

- **Categorías:**
  - normalización (`"  kit  de LABORATORIO "` → `"Kit de laboratorio"`);
  - categoría de 1 o de 41 caracteres → 400;
  - filtro sin distinguir tildes ni mayúsculas;
  - `suggestions` ordenado por cantidad;
  - la migración conserva los datos.
- **`ALLOWED_EMAILS`:** un correo de la lista se registra, uno fuera de la lista no.
- **`ADMIN_EMAILS`:** el rol se asigna al ingresar y se quita al sacarlo de la lista.
- **Recuperación:**
  - `forgot` responde igual exista o no la cuenta;
  - el código de `verify` no sirve para `reset`;
  - 5 intentos como máximo;
  - código vencido;
  - tras `reset`, el token viejo da 401 y el nuevo funciona.
- **Bloqueo:**
  - login → 403 `ACCOUNT_BLOCKED`;
  - token vigente → 401;
  - socket rechazado;
  - publicaciones ocultas para los demás;
  - al desbloquear todo vuelve.
- **Admin:**
  - un estudiante recibe 403 en cada ruta `/api/admin`;
  - ocultar cancela acuerdos y avisa;
  - un material moderado no se puede reactivar (409 `MODERATED`);
  - resolver con `hidden` resuelve todos los reportes del material;
  - no se puede bloquear a otro administrador;
  - cada acción queda en `ModerationLog`.

**App y panel:**

- `tsc` y `vite build` sin errores.
- Verificación en el navegador:
  - selector propio en cada lugar, con teclado incluido;
  - 👁 en cada contraseña;
  - curso y categoría libres, con sugerencias;
  - recuperación completa;
  - el panel: entrar, ocultar, restaurar, resolver un reporte y bloquear o desbloquear.
- Celular real (APK 2.1): sin hueco sobre la barra en Detalle y Publicar, y teclado abierto en Publicar.

## 6. Despliegue

- Variables nuevas en Render: `ALLOWED_EMAILS` (el correo de prueba de tu novio) y `ADMIN_EMAILS` (tu correo).
- La migración se aplica sola al arrancar (`start:prod`).
- APK **2.1** (`versionCode 7`).
- Documentación: `docs/backend-explicado.md` (moderación, recuperación, sesiones), el README y `server/README.md`.

## 7. Fuera de alcance

- Administrar `ALLOWED_EMAILS` desde el panel (opción E): queda como variable de Render.
- Notificaciones por correo al moderar; el aviso es solo dentro de la app y por push.
- Roles intermedios (moderador sin poder bloquear).
- Push en la PWA.
