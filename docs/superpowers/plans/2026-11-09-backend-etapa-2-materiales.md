# Backend EcoEstudiante, Etapa 2 (Materiales y fotos): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las publicaciones, las fotos, los guardados, las alertas de búsqueda y los reportes viven en el servidor. Dos
estudiantes ven las mismas publicaciones.

**Architecture:** El módulo `materials` del servidor sigue `routes → service → Prisma`. Un `ImageStorage` con dos
implementaciones (Cloudinary o disco local) guarda las fotos. En la app, un archivo nuevo `src/lib/sync.ts` trae los
datos del servidor a la caché del store, y las acciones de materiales pasan a ser `async` contra la API. Chat, acuerdos
y simulación de bots siguen locales hasta las etapas 3 y 4 (modo mixto).

**Tech Stack:** lo de la etapa 1, más `multer` (multipart) y `cloudinary` (SDK v2).

**Spec:** `docs/superpowers/specs/2026-11-09-backend-design.md` (§3 Material, MaterialImage, SavedMaterial,
SavedSearch, Report y "Borrado de materiales"; §4.2 filas de materiales, fotos, guardados, búsquedas y reportes; §4.3
reglas 1, 7 y 8; §6 fotos y caché).

## Global Constraints

- Todo lo de la etapa 1 sigue vigente: errores `{ error: { code, message } }` en español, `.strict()` en cada esquema zod y `requireAuth` en las rutas 🔒.
- La API expone las etiquetas de la app: modalidad `'Venta' | 'Intercambio' | 'Donación'` y estado de conservación `'Como nuevo' | 'Buen estado' | 'Usado'`. Se convierten con `server/src/enums.ts`.
- Precio: entero de 1 a 1000 si es `Venta`; se guarda 0 en `Intercambio` y `Donación` (spec §4.3.7).
- Fotos: hasta 5 por material y por subida, JPEG/PNG/WebP de hasta 2 MB. El tipo se valida por **firma de bytes**, no solo por el `Content-Type`.
- `GET /materials` pagina de a **20**. Solo lista `Disponible` y `Reservado`, ordenados por `createdAt` de más nuevo a más viejo.
- Los ids sembrados (`m-1`…, `u-maria`…) se conservan.
- Los regex con barras invertidas se editan con la herramienta Edit, nunca con scripts de shell (la etapa 1 perdió dos escapes así).

## Desviaciones del spec (decididas en este plan)

1. **Fotos como URLs.** El spec decía `images: [{url, publicId}]`. La API recibe y devuelve `images: string[]` (URLs), y el servidor deduce el `publicId` desde la URL. Así la app conserva `Material.images: string[]` sin cambios. Al crear o editar, el servidor solo acepta URLs de su propio almacenamiento o las que el material ya tenía. Se actualiza el spec §4.2 en la Task 7.
2. **"Entregado" manual.** La pantalla Mi actividad deja que el dueño marque su material como entregado (entregas fuera de la app). `PATCH /materials/:id/status` permite `Disponible ↔ Pausado` y `Disponible | Reservado → Entregado`. Se actualiza el spec §4.2.
3. **El bot `buyer_interest` no se programa todavía.** Llega en la etapa 4. Mientras tanto, la app conserva su simulación local al publicar.
4. **Filtros en el servidor y en la app.** El servidor implementa todos los filtros de §4.2 (son parte de la API que se defiende). La app descarga todas las páginas disponibles y sigue filtrando en el teléfono, para que los filtros respondan al instante y funcionen sin conexión.
5. **Avisos de búsquedas guardadas.** Al publicar, el servidor crea las filas `Notification` (categoría `busquedas`). La app las mostrará cuando las notificaciones pasen al servidor en la etapa 3.

## Review Focus

1. **Subir un archivo que no es imagen renombrado a `.jpg`** (por ejemplo, un PDF): responde 400 `INVALID_IMAGE`, nunca lo guarda. La prueba va en la Task 1.
2. **Crear o editar un material con una URL de foto ajena** (`https://evil.pe/x.jpg`): responde 400 `VALIDATION`. La prueba va en la Task 2.
3. **Material `Pausado` o `Eliminado` pedido por otra persona por id**: responde 404, como si no existiera. La prueba va en la Task 2.
4. **Editar, pausar o borrar el material de otro**: responde 403 `FORBIDDEN` y no cambia nada. La prueba va en la Task 3.
5. **Caché de la app con materiales que ya no existen en el servidor**: desaparecen de Explorar al refrescar, salvo que un chat o acuerdo local los use, porque si no esa pantalla se rompería. Se verifica a mano en la Task 6.

---

## Mapa de archivos

```
server/src/integrations/images.ts      ← createImageStorage(config, deps?): ImageStorage
server/src/modules/uploads/routes.ts   ← POST /api/uploads
server/src/modules/materials/{routes,service,schemas,dto}.ts
server/src/modules/saved/{routes,service,schemas}.ts      ← guardados + búsquedas guardadas
server/src/modules/reports/{routes,service,schemas}.ts
server/src/middleware/auth.ts          ← + optionalAuth
server/src/modules/users/service.ts    ← getPublicUser agrega materials
shared/search.ts                       ← matchesSearch (app y servidor)
server/test/{uploads,materials,saved,reports}.test.ts, fixtures/ (png, jpg, pdf de prueba)
src/lib/sync.ts                        ← DTO → caché; loadMaterials, loadMaterial, loadProfile, loadActivity
src/lib/images.ts                      ← + uploadImages(dataUrls): Promise<string[]>
src/lib/store.ts, src/lib/types.ts, src/lib/data.ts, src/App.tsx
src/screens/{Explore,Detail,Publish,Profile,Activity}.tsx
```

---

### Task 1: Almacenamiento de fotos y `POST /api/uploads`

**Files:**
- Create: `server/src/integrations/images.ts`, `server/src/modules/uploads/routes.ts`, `server/test/uploads.test.ts`, `server/test/fixtures/{photo.jpg,photo.png,doc.pdf}` (los generan los propios tests con sus primeros bytes reales; no hace falta binarios grandes)
- Modify: `server/src/config.ts` (`uploadsDir`, `cloudinaryUrl`), `server/src/app.ts` (`AppDeps.images`, `/uploads` estático, ruta), `server/.env.example`, `.gitignore`

**Interfaces:**
- Produces:
  - `Config` suma `uploadsDir: string` (por defecto `<server>/uploads`) y `cloudinaryUrl?: string`.
  - `type ImageStorage = { mode: 'cloudinary' | 'local'; save(file: { buffer: Buffer; mime: 'image/jpeg' | 'image/png' | 'image/webp' }): Promise<string>; owns(url: string): boolean; remove(url: string): Promise<void> }`.
    - `save` devuelve la URL pública.
    - `owns` indica si una URL es de este almacenamiento.
    - `remove` ignora las URLs ajenas y los errores (solo los registra).
  - `createImageStorage(config, deps?: { cloudinary?: CloudinaryLike }): ImageStorage`.
    - **Local:** escribe `<uploadsDir>/<randomUUID>.<ext>` y devuelve `${publicUrl}/uploads/<archivo>`. `owns` exige ese prefijo exacto y un nombre sin `/` ni `..`.
    - **Cloudinary:** sube a la carpeta `ecoestudiante` con `upload_stream` y devuelve `secure_url`. `owns` exige `https://res.cloudinary.com/<cloud>/image/upload/` y `/ecoestudiante/`. `remove` deriva el `public_id` de la URL.
  - `detectImageMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null`, por firma: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF….WEBP`.
  - `AppDeps` suma `images: ImageStorage`.
  - `POST /api/uploads` 🔒 recibe multipart con el campo `files` (de 1 a 5) y responde 201 `{ urls: string[] }`.

- [ ] **Step 1: Instalar** `npm i multer cloudinary` y `npm i -D @types/multer` en `server/`. Aprobar los scripts de instalación si npm lo pide.
- [ ] **Step 2: Escribir las pruebas que fallan** en `test/uploads.test.ts`. Usan `makeApp({ uploadsDir: <tmp> })`, un token de `registerAndVerify` y búferes con firmas reales (por ejemplo, JPEG = `FF D8 FF E0` + 100 bytes).
  - Subir 2 fotos (jpg y png) responde 201 con `urls` que empiezan con `http://localhost:3000/uploads/`. Los archivos existen en `uploadsDir`, y `GET /uploads/<archivo>` responde 200 con el mismo contenido.
  - Un PDF (`%PDF-1.4…`) enviado como `photo.jpg` con `image/jpeg` responde 400 `INVALID_IMAGE` con `'Solo se aceptan fotos JPG, PNG o WebP.'`, y no se escribe ningún archivo.
  - Un archivo de 2 MB + 1 byte responde 413 `FILE_TOO_LARGE` con `'Cada foto puede pesar hasta 2 MB.'`.
  - 6 archivos responden 400 `TOO_MANY_FILES` con `'Puedes subir hasta 5 fotos.'`.
  - Sin archivos: 400 `VALIDATION`. Sin token: 401.
  - `createImageStorage` con `cloudinaryUrl` y un `cloudinary` falso usa la carpeta `ecoestudiante` y devuelve su `secure_url`. Su `owns` acepta esa URL y rechaza `https://res.cloudinary.com/otro/image/upload/x.jpg`.
  - `owns` local rechaza `http://localhost:3000/uploads/../.env` y `https://evil.pe/uploads/a.jpg`.
- [ ] **Step 3: Ejecutar** `npm test -- uploads` y ver el FAIL.
- [ ] **Step 4: Implementar.**
  - `multer({ storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 5 } })`. Los `MulterError` `LIMIT_FILE_SIZE` y `LIMIT_FILE_COUNT` se traducen al `AppError` correspondiente.
  - Se valida **cada** búfer con `detectImageMime` antes de guardar **cualquiera** de ellos.
  - `express.static(config.uploadsDir, { fallthrough: false, index: false })` en `/uploads`, solo en modo local.
  - Agregar `server/uploads/` al `.gitignore` (ya está) y `CLOUDINARY_URL` al `.env.example` (ya está).
- [ ] **Step 5: Ejecutar** `npm test` y `npm run typecheck`: PASS. **Step 6: Commit** con `git commit -m "Servidor: subida de fotos a Cloudinary o disco local"`.

---

### Task 2: Materiales: crear, listar y ver

**Files:**
- Create: `shared/search.ts`, `server/src/modules/materials/{schemas,dto,service,routes}.ts`, `server/test/materials.test.ts`
- Modify: `server/src/middleware/auth.ts` (`optionalAuth`), `server/src/app.ts`, `src/lib/store.ts` (importa `matchesSearch` desde `shared/search`)

**Interfaces:**
- Consumes: `ImageStorage.owns`, `requireAuth`, `userRating`, `toMode`/`modeLabel`/`toCondition`/`conditionLabel`.
- Produces:
  - `matchesSearch(material: { title: string; course: string; category: string; mode: string }, search: { query: string; category: string; mode: string }): boolean`, en `shared/search.ts`. Es la misma lógica que `src/lib/store.ts` hoy (búsqueda sin distinguir mayúsculas en `title`, `course` y `category`; `'Todos'` no filtra). `store.ts` la re-exporta.
  - `type OwnerDto = { id; name; career; cycle; rating: { value: number; count: number } }`
  - `type MaterialDto = { id; ownerId; title; course; career; cycle; category; mode: ModeLabel; price; exchangeFor?: string; condition: ConditionLabel; description; images: string[]; status: MaterialStatus; createdAt: string; owner: OwnerDto }`
  - `toMaterialDtos(materials, prisma): Promise<MaterialDto[]>`. Calcula la reputación de todos los dueños en **una** consulta (`review.groupBy` por `targetId`).
  - `optionalAuth(config)`: igual que `requireAuth`, pero sin token deja `req.user` sin definir. Un token inválido **no** da error: se trata como anónimo.
  - `GET /api/materials?q&category&mode&career&cycle&condition&maxPrice&page` → `{ items: MaterialDto[]; page: number; hasMore: boolean }`. `maxPrice` solo filtra las ventas, como hace hoy la app.
  - `GET /api/materials/:id` (optionalAuth) → `MaterialDto`.
  - `POST /api/materials` 🔒 → 201 `MaterialDto`. Body (`.strict()`): `{ title (5–100), course (1–80), career ∈ CAREERS, cycle 1–10, category ∈ CATEGORIES, mode ∈ MODES, price: int ≥ 0, exchangeFor?: string ≤ 120, condition ∈ CONDITIONS, description (20–1000), images: url[] (1–5) }`.

- [ ] **Step 1: Escribir las pruebas que fallan** (`beforeEach(resetDb)`; `seed(prisma)` donde haga falta; la app usa `makeApp({}, { images: fakeStorage })`, con `owns = url.startsWith('https://img.test/')`):
  - Crear con datos válidos responde 201 con las etiquetas de la app (`mode: 'Donación'`, `condition: 'Como nuevo'`), `status: 'Disponible'`, `ownerId` del token y `owner.rating = { value: 0, count: 0 }`. `price` se guarda en 0 si no es venta aunque llegue 15.
  - Venta con `price` 0 o 1001 responde 400 con `fields.price === 'El precio de venta va de S/ 1 a S/ 1000.'`.
  - Una URL de foto ajena (`https://evil.pe/x.jpg`) responde 400 con `fields.images === 'Usa fotos subidas desde la app.'`. 0 fotos o 6 fotos: 400.
  - Sin token: 401. Con `ownerId` o `status` en el body: 400 (por `.strict()`).
  - Tras `seed`, `GET /materials` devuelve los materiales `Disponible` y `Reservado`, de más nuevo a más viejo, con `owner.name` y la reputación (`u-maria` → 4.7).
  - Filtros, con un caso cada uno: `q=calculadora` (sin distinguir mayúsculas, busca en título y curso), `category=Libros`, `mode=Donación`, `career`, `cycle=4`, `condition=Usado`, `maxPrice=20` (excluye ventas de más de 20 e incluye las donaciones).
  - Paginación: con 25 materiales, `page=1` trae 20 y `hasMore: true`; `page=2` trae 5 y `hasMore: false`. `page=0` o `page=abc`: 400.
  - `GET /materials/:id` de un material `Pausado` responde 200 para su dueño y 404 `MATERIAL_NOT_FOUND` (`'Esta publicación ya no existe.'`) para otro usuario o sin token.
  - Un material `Eliminado` es visible para un participante de una de sus conversaciones (crearla con prisma) y da 404 para el resto.
  - Al crear un material que coincide con la `SavedSearch` de **otro** usuario, se crea una `Notification` para ese usuario con categoría `busquedas`, link `#/material/<id>` y texto `Nuevo material para tu búsqueda “<query o categoría>”: <title>`. Una búsqueda propia no genera aviso.
- [ ] **Step 2: Ejecutar** `npm test -- materials` y ver el FAIL. **Step 3: Implementar.**
  - Los filtros se arman como `where` de Prisma: `q` con `OR` de `contains` + `mode: 'insensitive'` sobre `title` y `course`, más la categoría si `q` coincide con ella.
  - La notificación de búsquedas se arma en `service.ts` con `matchesSearch` sobre las `SavedSearch` de otros usuarios.
- [ ] **Step 4: Ejecutar** `npm test` y `npm run typecheck`: PASS. **Step 5: Commit** con `git commit -m "Servidor: publicar, buscar y ver materiales"`.

---

### Task 3: Materiales: editar, cambiar estado, borrar y "mis publicaciones"

**Files:**
- Modify: `server/src/modules/materials/{routes,service,schemas}.ts`
- Test: `server/test/materials.test.ts`

**Interfaces:**
- Produces:
  - `PATCH /api/materials/:id` 🔒: mismo body que crear (todos los campos obligatorios) → `MaterialDto`. Las fotos que salen del material se borran del almacenamiento con `images.remove`.
  - `PATCH /api/materials/:id/status` 🔒 con `{ status: 'Disponible' | 'Pausado' | 'Entregado' }` → `MaterialDto`. Transiciones permitidas: `Disponible→Pausado`, `Pausado→Disponible`, `Disponible→Entregado` y `Reservado→Entregado`. Cualquier otra: 409 `INVALID_TRANSITION` con `'No se puede cambiar la publicación a ese estado.'`.
  - `DELETE /api/materials/:id` 🔒 → 204. Si tiene conversaciones o acuerdos: `status = Eliminado` y cancela sus acuerdos `Pendiente` o `Confirmado`. Si no tiene ninguno: borrado físico. En ambos casos se borran sus fotos del almacenamiento.
  - `GET /api/users/me/materials` 🔒 → `MaterialDto[]` (todos mis materiales salvo los `Eliminado`, de más nuevo a más viejo).
  - Errores comunes: si otra persona edita, cambia el estado o borra, responde 403 `FORBIDDEN` con `'Solo quien publicó puede modificar este material.'`. Si el material no existe o está `Eliminado`: 404 `MATERIAL_NOT_FOUND`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - El dueño edita título y fotos (quita una y agrega una nueva). `images.remove` se llama con la URL quitada. Mantener una URL sembrada (Unsplash) es válido, porque el material ya la tenía.
  - Otro usuario: 403 en `PATCH`, en `PATCH status` y en `DELETE`, y el material queda igual (verificar con prisma).
  - Transiciones: `Disponible→Pausado→Disponible` OK, `Disponible→Entregado` OK, `Entregado→Disponible` 409, `Reservado→Pausado` 409.
  - `DELETE` sin chats borra la fila y llama a `images.remove` con cada foto que no es sembrada. Con una conversación responde 204, queda `Eliminado` y deja de aparecer en `GET /materials` y en `/users/me/materials`. Un acuerdo `Pendiente` pasa a `Cancelado`.
  - `GET /users/me/materials` incluye mis materiales `Pausado` y no los de otros.
- [ ] **Step 2: Ejecutar** y ver el FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** `npm test`: PASS. **Step 5: Commit** con `git commit -m "Servidor: editar, pausar, entregar y borrar materiales"`.

---

### Task 4: Guardados, búsquedas guardadas, reportes y materiales en el perfil

**Files:**
- Create: `server/src/modules/saved/{routes,service,schemas}.ts`, `server/src/modules/reports/{routes,service,schemas}.ts`, `server/test/saved.test.ts`, `server/test/reports.test.ts`
- Modify: `server/src/modules/users/service.ts` (`PublicUserDto.materials: MaterialDto[]`, solo `Disponible`), `server/src/app.ts`, `server/test/users.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/saved` 🔒 → `MaterialDto[]` (excluye los `Eliminado`). `PUT /api/saved/:materialId` 🔒 → 204, idempotente. `DELETE /api/saved/:materialId` 🔒 → 204, idempotente. Un `materialId` inexistente en `PUT` responde 404.
  - `GET /api/saved-searches` 🔒 → `{ id; query; category; mode; createdAt }[]`. `POST /api/saved-searches` 🔒 con `{ query (0–80), category ('Todos' | categoría), mode ('Todos' | modalidad) }` → 201. Una búsqueda idéntica a otra del mismo usuario devuelve la existente con 200. `DELETE /api/saved-searches/:id` 🔒 → 204; la de otro usuario responde 404.
  - `POST /api/reports` 🔒 con `{ materialId, reason ∈ REPORT_REASONS, detail (0–500) }` → 201 `{ ok: true }`. Reportar dos veces el mismo material responde 200 sin duplicar. Reportar un material propio responde 400 `OWN_MATERIAL` con `'No puedes reportar tu propia publicación.'`.

- [ ] **Step 1: Escribir las pruebas que fallan**, una por cada comportamiento anterior. En `users.test.ts` se agrega: `GET /users/u-maria` incluye `materials`, solo los `Disponible` de María.
- [ ] **Step 2: Ejecutar** y ver el FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** `npm test` y `npm run typecheck`: PASS. **Step 5: Commit** con `git commit -m "Servidor: guardados, alertas de búsqueda y reportes"`.

---

### Task 5: App: caché sincronizada con el servidor

**Files:**
- Create: `src/lib/sync.ts`
- Modify: `src/lib/types.ts` (`User.rating?`), `src/lib/data.ts` (`STATE_VERSION = 2`, el seed local sin materiales), `src/lib/store.ts` (`userRating` usa `user.rating`; `setState` exportado como `updateCache` para `sync.ts`), `src/App.tsx` (después de `restoreSession`, `syncAll()`), `src/screens/Explore.tsx`, `src/screens/Detail.tsx`, `src/screens/Profile.tsx`

**Interfaces:**
- Consumes: `api`, `MaterialDto`, `OwnerDto` y `PublicUserDto` (forma de las tasks 2 y 4).
- Produces, en `src/lib/sync.ts`:
  - `fromMaterialDto(dto): Material` (`createdAt` pasa de ISO a número) y `adoptOwner(owner)`, que hace upsert en `state.users` con `rating`.
  - `loadMaterials(): Promise<void>`. Pide todas las páginas y reconcilia: hace upsert de los recibidos y quita de la caché los materiales ajenos `Disponible`/`Reservado` que ya no llegaron, **salvo** que los use una conversación o un acuerdo local.
  - `loadMaterial(id): Promise<'ok' | 'missing'>`: con 404 quita el material de la caché (bajo la misma regla).
  - `loadProfile(id): Promise<PublicUserDto | null>`: guarda el usuario y sus materiales en la caché y devuelve las reseñas.
  - `loadActivity(): Promise<void>`: pide `/users/me/materials`, `/saved` y `/saved-searches`, y reemplaza `saved[me]` y las búsquedas del usuario en la caché.
  - `syncAll()`: `Promise.allSettled([loadMaterials(), loadActivity()])`. Un fallo de red no rompe nada, solo deja la caché como estaba.
- Comportamiento de las pantallas:
  - **Explore** llama a `loadMaterials()` al montarse.
  - **Detail** llama a `loadMaterial(id)` al montarse.
  - **Profile** usa `loadProfile(id)`. Las reseñas vienen del servidor, más las valoraciones locales de acuerdos (modo mixto); se elimina el uso de `SEED_REVIEWS`. "Entregas" pasa a ser los acuerdos locales completados más `rating.count`.
  - Mientras cargan **por primera vez** y sin caché, las tres muestran `"Cargando…"`.

- [ ] **Step 1: Implementar** según las firmas. Subir `STATE_VERSION` a 2 reinicia los datos locales de la demo (chats y acuerdos de prueba). Es intencional: los materiales locales sembrados chocarían con los del servidor.
- [ ] **Step 2: Verificar** con `npx tsc --noEmit -p .` y `npx vite build`: sin errores.
- [ ] **Step 3: Verificar en el navegador** con el servidor y la base levantados y el seed cargado:
  - Explorar muestra los 7 materiales del servidor con la reputación de cada dueño.
  - Un material creado con `curl` (como otro usuario) aparece al volver a Explorar.
  - El perfil de María muestra sus 3 reseñas del servidor y sus materiales.
  - Un material borrado con `curl` desaparece de Explorar, y su detalle muestra "Esta publicación ya no existe".
- [ ] **Step 4: Commit** con `git commit -m "App: materiales y perfiles desde el servidor"`.

---

### Task 6: App: publicar con fotos, gestionar, guardar, buscar y reportar

**Files:**
- Modify: `src/lib/images.ts` (`uploadImages`), `src/lib/api.ts` (`apiUpload(path, form: FormData)`), `src/lib/store.ts` (acciones de materiales), `src/screens/Publish.tsx`, `src/screens/Activity.tsx`, `src/screens/Detail.tsx`, `src/screens/Explore.tsx`

**Interfaces:**
- Produces:
  - `apiUpload<T>(path, form): Promise<T>`: igual que `api`, pero sin `Content-Type` (lo pone el navegador).
  - `uploadImages(images: string[]): Promise<string[]>`. Convierte los `data:` URL en `Blob` y los sube con `POST /uploads` (campo `files`). Las URLs `http(s)` que ya existen se devuelven tal cual, en el mismo orden.
  - Acciones de `store.ts`, que ahora son `async` y muestran `toast(..., 'error')` con el mensaje del servidor si fallan:
    - `publishMaterial(input) → Promise<string | null>` (id o null). Conserva la simulación local `buyer-interest`.
    - `updateMaterial(id, input) → Promise<boolean>`
    - `setMaterialStatus(id, status) → Promise<boolean>`
    - `deleteMaterial(id) → Promise<boolean>`
    - `toggleSaved(materialId) → Promise<void>`: es optimista y revierte si falla.
    - `saveSearch(search) → Promise<void>` y `deleteSavedSearch(id) → Promise<void>`
    - `reportMaterial(materialId, reason, detail) → Promise<boolean>`: guarda el reporte en la caché para seguir ocultando el material.
  - Las pantallas esperan cada acción y deshabilitan su botón mientras tanto.
    - **Publish** sube las fotos y luego crea o edita. El botón muestra `"Publicando…"` y, si algo falla, se queda en el paso 3 sin perder lo escrito.
    - **Activity** espera pausar, reactivar, entregar y eliminar.

- [ ] **Step 1: Implementar.** Ajustar los textos de Publish que contradigan al servidor: precio máximo S/ 500 en la app (el servidor admite hasta 1000) y máximo 3 fotos en la app (el servidor admite 5). Ambos son límites más estrictos del lado de la app y se mantienen.
- [ ] **Step 2: Verificar** con `npx tsc --noEmit -p .` y `npx vite build`.
- [ ] **Step 3: Verificar en el navegador** con dos cuentas (A en la app; B por `curl` y luego en la app tras cerrar sesión):
  1. A publica una venta con 2 fotos. Las URLs de las fotos apuntan a `localhost:3000/uploads/` y cargan. B la ve en `GET /materials`.
  2. A edita el precio y quita una foto: el archivo quitado ya no está en `server/uploads/`.
  3. A pausa: B recibe 404 al pedir su detalle. A reactiva y la marca como entregada: deja de listarse.
  4. A guarda un material de María. Al recargar sigue guardado (viene de `/saved`).
  5. A guarda una búsqueda sin resultados ("física cuántica"). B publica un material "Física cuántica básica" por `curl` y en la base aparece la `Notification` de A con categoría `busquedas`.
  6. A reporta un material: deja de verlo, y existe la fila `Report`.
  7. Se cierra la sesión de A y se entra como B en la app: B ve la publicación de A con la reputación de A.
  8. Con la API apagada, publicar muestra `"No pudimos conectar con el servidor. Revisa tu conexión."` y el formulario conserva lo escrito.
  9. Sin errores en `read_console_messages`, salvo los provocados a propósito.
- [ ] **Step 4: Commit** con `git commit -m "App: publicar con fotos, guardados, alertas y reportes contra el servidor"`.

---

### Task 7: Documentación

**Files:**
- Modify: `docs/superpowers/specs/2026-11-09-backend-design.md` (§4.2: fotos como URLs y transición manual a `Entregado`), `docs/backend-explicado.md` (estado: etapa 2 construida; §6 y §7.2 con las fotos como URLs y la validación por firma; §8 seguridad de las subidas), `server/README.md` (Cloudinary: cómo obtener `CLOUDINARY_URL`)

- [ ] **Step 1: Actualizar** los tres documentos con lo que quedó construido.
- [ ] **Step 2: Commit** con `git commit -m "Docs: etapa 2 del backend"`.
