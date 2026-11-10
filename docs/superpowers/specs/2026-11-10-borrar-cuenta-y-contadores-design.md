# Eliminar cuenta, campana con número y contador de Actividad — diseño

**Fecha:** 2026-11-10 · **Estado:** aprobado en el chat ("Aprobado") · **Rama:** `borrar-cuenta`

## Qué pidió el usuario

1. Que cada estudiante pueda **borrar su cuenta y sus datos**. Lo que hizo (publicaciones, acuerdos) debe quedar registrado **solo en `/admin`**.
2. La **campana** de notificaciones del celular debe tener el color de la app y un **número**, como Actividad.
3. El número de **Actividad** debe desaparecer al revisar la pestaña. Hoy no se va.

Decisión del usuario: quien tenía chats o acuerdos con la cuenta borrada los conserva, con el nombre **"Usuario eliminado"** (opción A).

## 1. Campana con número (solo la app)

- `Topbar` en `src/App.tsx`: el puntito `<i />` se reemplaza por `<span className="count-badge">`. Es el mismo globito naranja de Actividad. Muestra `9+` cuando hay más de 9.
- Estilo en `src/index.css` (`.topbar__actions > a:first-child`):
  - el círculo pasa de `white` a `var(--forest-50)`;
  - el ícono se pinta con `var(--forest-800)`;
  - el globito se posiciona arriba a la derecha, igual que `.mobile-nav__icon .count-badge`.
- El número sale de `useBadges().notifications`, que ya existe y ya baja al leer las notificaciones.

## 2. Contador de Actividad: solo lo nuevo

**Causa actual:** `useBadges` suma los mensajes sin leer y `toRate`, que son los acuerdos donde soy comprador y están `Confirmado` o `Completado` sin reseña. Es una tarea pendiente, así que no se va al mirar la pestaña.

**Nuevo cálculo:** `activity = mensajes sin leer + acuerdos nuevos`.

**Qué es un acuerdo nuevo:** un acuerdo mío con `updatedAt > visto[id]`, donde `visto` es un mapa `{ [agreementId]: timestamp }` guardado en `localStorage` por usuario. La clave es `eco-agreements-seen:<userId>`.

**Cuándo se marca como visto:**
- Al abrir la pestaña **Acuerdos** de Actividad, se marcan todos los acuerdos mostrados con su `updatedAt` actual.
- Al abrir la pantalla de un acuerdo (`#/acuerdo/:id`), se marca ese acuerdo.

**Sin mapa guardado** (primer uso o reinstalación): el mapa se crea con todos los acuerdos actuales, así que se empieza sin pendientes.

**El recordatorio "Valorar"** sigue en la lista de acuerdos, pero ya no suma al contador.

**El cálculo es puro**, en `src/lib/store.ts`: `newAgreementsCount(agreements, userId, seen)`. Así se puede probar.

## 3. Eliminar mi cuenta

### API

`DELETE /api/users/me`, con el cuerpo `{ password }` (zod `.strict()`).

| Caso | Respuesta |
|---|---|
| Contraseña incorrecta | 401 `INVALID_PASSWORD` |
| Bots | No aplica: los bots no tienen sesión |
| Eliminación correcta | 204 |

### Modelo (migración `borrar_cuenta`)

`User` agrega tres campos:
- `deletedAt DateTime?`
- `deletedName String?`
- `deletedEmail String?`

Los dos últimos guardan los datos reales y **solo los ve el administrador**.

### Qué hace el servidor

Todo ocurre en una transacción. Reutiliza el flujo de bloqueo de `admin/service.ts` (cancelar acuerdos, liberar materiales reservados, desconectar y avisar).

1. Verifica la contraseña.
2. Busca los acuerdos `Pendiente`/`Confirmado` del usuario.
3. Actualiza el usuario:

   | Campo | Nuevo valor |
   |---|---|
   | `deletedAt`, `blockedAt` | `now` |
   | `deletedName` | el nombre real |
   | `deletedEmail` | el correo real |
   | `name` | `"Usuario eliminado"` |
   | `email` | `eliminado-<id>@eliminado.invalid`, para liberar el correo |
   | `passwordHash` | un hash aleatorio |
   | `tokenVersion` | se incrementa en 1 |

4. Borra:
   - `SavedMaterial`, `SavedSearch`, `Notification`, `DeviceToken` y `EmailCode` del usuario;
   - de los otros usuarios, los `SavedMaterial` que apuntan a sus materiales.
5. Cancela sus acuerdos activos y devuelve a `Disponible` los materiales `Reservado` de esos acuerdos.
6. Después de la transacción:
   - `realtime.disconnectUser(id)`;
   - `agreements.announceCancelled(ids, id, { byDeletion: true })`. El aviso a la otra persona dice que la cuenta fue eliminada.

### Efectos en el resto del sistema

Usar `blockedAt` hace que lo siguiente ya funcione: las publicaciones ocultas en Explorar, el perfil en 404, que no se pueda abrir chat por sus materiales y que no pueda iniciar sesión.

| Situación | Comportamiento nuevo |
|---|---|
| Enviar un mensaje en una conversación con una cuenta eliminada | 409 `ACCOUNT_DELETED`, "Esta cuenta fue eliminada." |
| La app ve esa conversación | El campo de texto se cambia por el aviso "Esta cuenta fue eliminada" |
| Proponer o actualizar un acuerdo con una cuenta eliminada | 409 `ACCOUNT_DELETED` |
| Registro o verificación con el correo original | Funciona como cuenta nueva: el correo quedó libre |
| Chats, acuerdos y reseñas de los demás | Se conservan y muestran "Usuario eliminado", porque ese es el `name` |

**Panel `/admin`:**
- La lista de usuarios marca `deleted: true` y muestra `deletedName`, `deletedEmail` y la fecha, con la etiqueta **"Cuenta eliminada"**.
- **Desbloquear** una cuenta eliminada responde 409 `ACCOUNT_DELETED`.
- El **resumen** cuenta los usuarios activos sin las cuentas eliminadas.
- Las publicaciones, acuerdos, reseñas y reportes siguen visibles en el panel como hoy.
- Se agrega el valor `delete_account` a `ModerationAction`, con `adminId` = el mismo usuario. Así la eliminación aparece en el historial de moderación.

### App

**Cuenta:** al final aparece el botón **"Eliminar mi cuenta"**, en estilo de peligro. Abre una pantalla de confirmación:
- explica qué se borra y qué queda solo para el administrador;
- pide la contraseña con `PasswordInput`;
- tiene el botón "Eliminar definitivamente".

**Al eliminar con éxito:**
- se quita el push del celular;
- se limpia la sesión local con el mismo camino que `logout`;
- aparece el toast "Tu cuenta fue eliminada";
- se va a la pantalla de ingreso.

## Pruebas

**Servidor** (vitest + supertest, base real):
- eliminar con la contraseña incorrecta → 401;
- eliminar con la contraseña correcta → 204, y el token viejo deja de servir;
- el correo original se puede volver a registrar;
- sus materiales desaparecen de `/api/materials` pero siguen en `/api/admin/materials`;
- el perfil da 404;
- enviar un mensaje a la conversación → 409 `ACCOUNT_DELETED`;
- los acuerdos abiertos quedan `Cancelado`, el material `Reservado` vuelve a `Disponible` y la otra persona recibe una notificación;
- se borran los guardados y las búsquedas;
- `/admin`: la lista muestra `deletedName`/`deletedEmail`, desbloquear da 409 y el resumen no la cuenta.

**App:**
- pruebas puras de `newAgreementsCount`: sin mapa, acuerdos nuevos y vistos;
- verificación en el navegador de la campana con número y del flujo de eliminación.

## Fuera de alcance

- Borrar físicamente los mensajes y las reseñas: se conservan, por la decisión A.
- Exportar los datos del usuario antes de borrar.
- Período de gracia para arrepentirse.
