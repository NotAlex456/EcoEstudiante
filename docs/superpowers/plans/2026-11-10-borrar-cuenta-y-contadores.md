# Eliminar cuenta, campana con número y contador de Actividad — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada estudiante pueda eliminar su cuenta (con un registro que solo ve el administrador), que la campana muestre un número con el color de la app y que el contador de Actividad cuente solo lo nuevo.

**Architecture:** La eliminación reutiliza el flujo de bloqueo del panel: `blockedAt` ya oculta publicaciones, perfil y sesión. Además, guarda el nombre y el correo reales en campos solo para el admin y libera el correo. El contador de Actividad pasa a una función pura en `shared/`, con un mapa de "visto" en `localStorage`.

**Tech Stack:** Express 5, Prisma 6, PostgreSQL, zod, vitest + supertest; React 19 + Vite (app y panel).

**Spec:** `docs/superpowers/specs/2026-11-10-borrar-cuenta-y-contadores-design.md`

## Global Constraints

- **Idioma:** todos los textos visibles, comentarios y mensajes de error van en español.
- **Respuestas de la API:**
  - errores con `AppError(status, CODE, mensaje)`;
  - cuerpos validados con zod `.strict()` usando `body(schema)`.
- **Nombre de la cuenta borrada:** exactamente `Usuario eliminado`.
- **Correo reemplazado:** exactamente `eliminado-<id>@eliminado.invalid`.
- **Código de error:** `ACCOUNT_DELETED`, con el mensaje "Esta cuenta fue eliminada.".
- **Clave de "visto" en el celular:** `eco-agreements-seen:<userId>`.
- **Seguridad:** nunca escribir en la base de producción ni imprimir secretos.

## Review Focus

1. **Un admin eliminando su propia cuenta:** el correo cambia, así que deja de ser admin. Debe funcionar sin romper `/admin` para los demás admins.
2. **Eliminar dos veces:** el token viejo ya no sirve, así que el segundo intento debe dar 401 y no un 500.
3. **Buscar en `/admin` por el nombre o correo originales:** debe encontrar la cuenta eliminada (`deletedName`, `deletedEmail`).
4. **Un acuerdo `Confirmado` donde la cuenta eliminada era el comprador:** el material del vendedor debe volver a `Disponible`.
5. **Alguien que tenía guardado un material de la cuenta eliminada:** ese guardado desaparece y no deja huecos en la lista.

---

### Task 1: Migración y servicio de eliminación de cuenta

**Files:**
- Modify: `server/prisma/schema.prisma` (User: `deletedAt DateTime?`, `deletedName String?`, `deletedEmail String?`; enum `ModerationAction`: `delete_account`)
- Create: `server/prisma/migrations/<timestamp>_borrar_cuenta/migration.sql`, generado con `npx prisma migrate dev --name borrar_cuenta` contra la base local (puerto 5433)
- Create: `server/src/modules/users/delete.ts`
- Modify: `server/src/modules/users/routes.ts`, `server/src/modules/users/schemas.ts`, `server/src/app.ts` (pasa `hub` a `userRoutes`)
- Modify: `server/src/modules/agreements/service.ts` (`announceCancelled` acepta `{ byDeletion?: boolean }`)
- Test: `server/test/delete-account.test.ts`

**Interfaces:**
- Produces:
  - `deleteAccountService(hub: Hub): { deleteAccount(userId: string, password: string): Promise<void> }`
  - Ruta `DELETE /api/users/me`, con el cuerpo `{ password: string }` (1 a 200 caracteres). Responde 204, o 401 `INVALID_PASSWORD` con el mensaje "La contraseña no es correcta.".
  - `userRoutes(hub: Hub)`: ahora recibe `hub` y no `config`; usa `hub.config` internamente.

- [ ] **Step 1: Escribir las pruebas que fallan** en `test/delete-account.test.ts`. Cada una usa `resetDb`, `registerAndVerify`, `insertMaterial` y `authHeader`:

```ts
it('con contraseña incorrecta responde 401 y no cambia nada', async () => {
  // DELETE /api/users/me { password: 'mala' } → 401 INVALID_PASSWORD; GET /api/auth/me con el token sigue 200
})
it('elimina: 204, el token deja de servir y el nombre pasa a "Usuario eliminado"', async () => {
  // user en BD: name 'Usuario eliminado', email `eliminado-${id}@eliminado.invalid`, deletedName/deletedEmail = originales,
  // deletedAt y blockedAt no nulos; GET /api/auth/me con el token viejo → 401
})
it('el correo original queda libre para registrarse de nuevo', async () => {
  // registerAndVerify(app) con el mismo validRegistration → no lanza
})
it('borra guardados, búsquedas, notificaciones y celulares; y los guardados de otros que apuntan a sus materiales', async () => {
  // savedMaterial/savedSearch/notification/deviceToken del usuario = 0; savedMaterial de B sobre material de A = 0
})
it('cancela sus acuerdos activos, libera el material reservado y avisa a la otra persona', async () => {
  // acuerdo Confirmado (A comprador, B vendedor, material Reservado) → Cancelado, material Disponible,
  // B tiene una notificación de categoría 'acuerdos' que contiene 'eliminó su cuenta'
})
it('sus publicaciones desaparecen de Explorar y su perfil da 404', async () => {
  // GET /api/materials no incluye el material; GET /api/users/:id → 404
})
it('eliminar dos veces con el token viejo responde 401, no 500', async () => {})
```

- [ ] **Step 2: Correr y verlas fallar**

Run: `cd server && npx vitest run test/delete-account.test.ts`
Expected: FAIL, la ruta da 404.

- [ ] **Step 3: Implementar**
  1. Esquema y migración.
  2. `delete.ts`:
     - compara la contraseña con bcrypt;
     - busca los acuerdos activos, igual que `blockUser` en `admin/service.ts`;
     - en una sola `prisma.$transaction`, hace los cambios de la tabla de la spec y borra los registros;
     - después: `hub.realtime.disconnectUser`, `agreements.announceCancelled(ids, userId, { byDeletion: true })` y `moderationLog.create({ adminId: userId, action: 'delete_account', targetId: userId })`.
  3. Texto del aviso con `byDeletion`: `La entrega de “${title}” se canceló porque la otra persona eliminó su cuenta.`
  4. El hash aleatorio sale de `bcrypt.hash(crypto.randomUUID(), 10)`.

- [ ] **Step 4: Correr y verlas pasar**

Run: `cd server && npx vitest run test/delete-account.test.ts test/users.test.ts test/agreements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** con el mensaje `Servidor: eliminar mi cuenta (DELETE /api/users/me)`.

### Task 2: No se puede escribir a una cuenta eliminada, y la app lo sabe

**Files:**
- Modify: `server/src/modules/conversations/service.ts` (`sendMessage`: si el otro participante tiene `deletedAt` → 409 `ACCOUNT_DELETED`)
- Modify: `server/src/modules/conversations/dto.ts` (`other.deleted: boolean`)
- Modify: `server/src/modules/materials/dto.ts` (`OwnerDto` agrega `deleted?: boolean`)
- Test: `server/test/delete-account.test.ts` (se agregan casos)

**Interfaces:**
- Consumes: `DELETE /api/users/me` (Task 1)
- Produces: `ConversationDto.other.deleted: boolean`, que la Task 5 consume

- [ ] **Step 1: Pruebas que fallan**

```ts
it('escribir en una conversación con una cuenta eliminada responde 409 ACCOUNT_DELETED', async () => {})
it('la lista de conversaciones marca a la otra persona como eliminada', async () => {
  // GET /api/conversations (como B) → items[0].other.deleted === true, other.name === 'Usuario eliminado'
})
```

- [ ] **Step 2: Correr y verlas fallar.** Run: `cd server && npx vitest run test/delete-account.test.ts`. Expected: 2 FAIL.
- [ ] **Step 3: Implementar.** `sendMessage` lee `deletedAt` del otro participante antes de crear el mensaje. El DTO usa `deleted: Boolean(others[i].deletedAt)`.
- [ ] **Step 4: Correr y verlas pasar.** Run: `cd server && npx vitest run test/delete-account.test.ts test/conversations.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** con el mensaje `Chat: no se puede escribir a una cuenta eliminada`.

### Task 3: Panel /admin muestra las cuentas eliminadas

**Files:**
- Modify: `server/src/modules/admin/service.ts`
  - `listUsers`: devuelve `deleted`, `deletedAt`, y `name`/`email` reales (`deletedName ?? name`, `deletedEmail ?? email`); la búsqueda `q` también busca en `deletedName`/`deletedEmail`;
  - el dueño en las publicaciones y quien reporta en los reportes muestran el nombre y correo reales;
  - `unblockUser`: si tiene `deletedAt` → 409 `ACCOUNT_DELETED`;
  - `stats.students` agrega `deletedAt: null`.
- Modify: `server/admin-web/src/api.ts` (`AdminUser.deleted: boolean`, `deletedAt: string | null`; `Owner.deleted?: boolean`)
- Modify: `server/admin-web/src/views/Users.tsx` (pill `Cuenta eliminada` con la fecha; sin botón de bloquear o desbloquear)
- Modify: `server/admin-web/src/views/Materials.tsx` (pill `Cuenta eliminada` junto al dueño)
- Modify: `server/admin-web/src/views/Summary.tsx` (`delete_account: 'eliminó su propia cuenta'`)
- Modify: `server/admin-web/src/styles.css` (`.pill--eliminada`, gris)
- Test: `server/test/admin.test.ts` (se agregan casos)

- [ ] **Step 1: Pruebas que fallan**

```ts
it('la lista de usuarios muestra la cuenta eliminada con su nombre y correo originales', async () => {
  // items: { deleted: true, name: <original>, email: <original> }; ?q=<correo original> la encuentra
})
it('no se puede desbloquear una cuenta eliminada', async () => { /* 409 ACCOUNT_DELETED */ })
it('el resumen no cuenta las cuentas eliminadas', async () => {})
it('sus publicaciones siguen en /api/admin/materials con el dueño real', async () => {})
```

- [ ] **Step 2: Correr y verlas fallar.** Run: `cd server && npx vitest run test/admin.test.ts`. Expected: 4 FAIL.
- [ ] **Step 3: Implementar.** Servicio y vistas del panel.
- [ ] **Step 4: Verificar.** Run: `cd server && npx vitest run test/admin.test.ts && npm run typecheck && npm run build:admin`. Expected: PASS y compilación sin errores.
- [ ] **Step 5: Commit** con el mensaje `Panel: cuentas eliminadas con sus datos originales`.

### Task 4: Contador de Actividad y campana con número

**Files:**
- Create: `shared/activity.ts`
- Modify: `src/App.tsx` (`useBadges` usa `newAgreementsCount`; en `Topbar`, el `<i />` pasa a ser un `count-badge` con `badgeText`)
- Modify: `src/screens/Activity.tsx` (al mostrar la pestaña `acuerdos`, `markAgreementsSeen(me.id, agreements)`)
- Modify: `src/screens/Agreement.tsx` (al montar, `markAgreementsSeen(me.id, [agreement])`)
- Modify: `src/lib/store.ts` (estado `agreementsSeen` cargado desde `localStorage` y la función `markAgreementsSeen`, para que el contador se actualice al instante)
- Modify: `src/index.css` (`.topbar__actions > a:first-child`: fondo `var(--forest-50)`, color `var(--forest-800)`; `.topbar__actions .count-badge` en posición absoluta arriba a la derecha)
- Test: `server/test/shared.test.ts` (se agregan casos)

**Interfaces:**
- Produces, en `shared/activity.ts`:
  - `type SeenMap = Record<string, number>`
  - `newAgreementsCount(agreements: { id: string; updatedAt: number; buyerId: string; sellerId: string }[], userId: string, seen: SeenMap | null): number`. Con `seen === null` devuelve 0.
  - `badgeText(n: number): string`. Devuelve `'9+'` si `n > 9`.

- [ ] **Step 1: Pruebas que fallan**

```ts
describe('shared/activity', () => {
  it('sin mapa guardado no hay pendientes', () => expect(newAgreementsCount([a(1, 100)], 'me', null)).toBe(0))
  it('cuenta los acuerdos míos actualizados después de verlos', () => {
    expect(newAgreementsCount([a('x', 200), a('y', 100)], 'me', { x: 150, y: 100 })).toBe(1)
  })
  it('un acuerdo que nunca vi cuenta como nuevo', () => expect(newAgreementsCount([a('z', 50)], 'me', {})).toBe(1))
  it('ignora acuerdos ajenos', () => {})
  it('badgeText: 9+ desde 10', () => { expect(badgeText(9)).toBe('9'); expect(badgeText(10)).toBe('9+') })
})
```

- [ ] **Step 2: Correr y verlas fallar.** Run: `cd server && npx vitest run test/shared.test.ts`. Expected: FAIL, el módulo no existe.
- [ ] **Step 3: Implementar** `shared/activity.ts` y conectarlo en la app. Al cargar el estado de un usuario sin mapa guardado, se inicializa con los `updatedAt` actuales.
- [ ] **Step 4: Verificar**
  - Run: `cd server && npx vitest run test/shared.test.ts`. Expected: PASS.
  - Run: `npx tsc --noEmit -p .` en la raíz. Expected: sin errores.
- [ ] **Step 5: Commit** con el mensaje `App: campana con número y Actividad cuenta solo lo nuevo`.

### Task 5: Pantalla "Eliminar mi cuenta" y chat con cuenta eliminada

**Files:**
- Modify: `src/lib/store.ts`
  - `deleteAccount(password: string): Promise<boolean>`: llama a `api('DELETE', '/users/me', { password })`; si sale bien, llama a `logout()` y muestra el toast "Tu cuenta fue eliminada";
  - borra `eco-agreements-seen:<id>`.
- Modify: `src/lib/types.ts` (`User.deleted?: boolean`)
- Modify: `src/lib/sync.ts` (adopta `other.deleted` en el usuario)
- Modify: `src/screens/Account.tsx`
  - botón `Eliminar mi cuenta`, con `href="#/cuenta/eliminar"`;
  - sección `eliminar`: explica qué se borra y qué queda solo para el administrador, pide la contraseña con `PasswordInput` y tiene el botón de peligro "Eliminar definitivamente". Al terminar, `navigate('#/', { replace: true })`.
- Modify: `src/screens/Chat.tsx` (si `other.deleted`, en vez del formulario se muestra `<p className="chat__closed">Esta cuenta fue eliminada.</p>`)
- Modify: `src/app.css` (`.button--danger`, si no existe, y `.chat__closed`)

- [ ] **Step 1: Implementar.** Es interfaz sin una unidad pura nueva: la lógica la cubren las Tasks 1 y 2.
- [ ] **Step 2: Verificar en el navegador** con el servidor local (`server`: `npm run dev`; app: preview `ecoestudiante`).
  1. Registrar a dos usuarios, A y B; A publica y B abre un chat.
  2. A va a Cuenta → Eliminar mi cuenta:
     - con la contraseña mala ve un error;
     - con la buena vuelve a la pantalla de ingreso.
  3. B ve "Usuario eliminado" y "Esta cuenta fue eliminada." en el chat.
  4. La campana muestra el número.
  5. El número de Actividad desaparece al abrir Acuerdos.
- [ ] **Step 3: Verificar el tipado y las pruebas.** Run: `npx tsc --noEmit -p .` y `cd server && npx vitest run`. Expected: sin errores y toda la suite en verde.
- [ ] **Step 4: Documentación.** En `docs/backend-explicado.md`, agregar una sección corta (§7.9) sobre la eliminación de cuenta y una fila en la tabla de seguridad.
- [ ] **Step 5: Commit** con el mensaje `App: eliminar mi cuenta y aviso en el chat`.
