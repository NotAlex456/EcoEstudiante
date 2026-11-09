# Backend EcoEstudiante, Etapas 3 y 4 (Chat, acuerdos y bots): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las conversaciones, los mensajes en tiempo real, los acuerdos de entrega, las reseñas, las notificaciones dentro
de la app y los estudiantes simulados pasan al servidor. Dos estudiantes reales chatean, acuerdan, completan y reseñan
una entrega, y los bots responden igual que antes.

**Architecture:** Un único `notify()` guarda cada aviso y lo empuja por Socket.IO a la sala `user:<id>` (el push con la
app cerrada llega en la etapa 5). Los módulos `conversations`, `agreements` y `notifications` siguen
`routes → service → Prisma`. Los cambios se avisan por socket; los clientes nunca escriben por el socket. Un worker
ejecuta los `BotJob` vencidos llamando a los **mismos servicios** que un usuario. En la app, `socket.ts` aplica los
eventos a la caché y desaparece toda la simulación local (`ScheduledEvent`, `processScheduled`).

**Tech Stack:** lo de las etapas anteriores, más `socket.io` (servidor) y `socket.io-client` (app y pruebas).

**Spec:** `docs/superpowers/specs/2026-11-09-backend-design.md`: §3 Conversation, Message, Agreement, Review,
Notification y BotJob; §4.2 filas de chat, acuerdos y notificaciones; §4.3 reglas 2 a 6; §5.1, §5.3 y §5.4; §6
notificaciones.

## Por qué las etapas 3 y 4 van juntas

Casi todas las publicaciones de la demo son de estudiantes simulados. Si el chat y los acuerdos pasan al servidor sin
los bots, la simulación local dejaría de funcionar: escribirle a un bot no tendría respuesta y nadie confirmaría las
entregas. Hacer ambas etapas juntas evita entregar una versión intermedia peor que la actual. El worker de bots es
chico (tres tipos de trabajo) y se apoya directamente en los servicios de esta etapa.

## Global Constraints

- Todo lo de las etapas 1 y 2 sigue vigente: errores en español con `{ error: { code, message } }`, `.strict()` y `requireAuth`.
- **Los clientes nunca escriben por el socket.** El socket solo recibe eventos del servidor: `message:new`, `conversation:read`, `agreement:updated`, `material:updated` y `notification:new`.
- El servidor usa la hora de Lima (`America/Lima`) para las reglas de fecha y para "hoy".
- Textos fijos que se mantienen idénticos a la app actual:
  - Propuesta: `📍 Propuesta de entrega: <lugar>, <formatDate> a las <formatTime>.` + ` Nota: <nota>` si la hay.
  - Confirmación de un bot: `✅ ¡Confirmado! Nos vemos ahí. Llevaré el material.`
  - Interés de un bot: `¡Hola! Me interesa <título>. ¿Sigue disponible?` (en donación: `¡Hola! Me serviría mucho <título>. ¿Aún lo estás donando?`).
  - Bienvenida y búsquedas: los textos de las etapas 1 y 2.
- `formatDate` y `formatTime` se mueven a `shared/format.ts`. `simulatedReply`, `buyerReply` y el texto de interés se mueven a `shared/bot-replies.ts`. App y servidor usan los mismos.
- En la raíz, las dependencias se instalan con `npx pnpm@10.34.3 add …`, porque el proyecto Figma Make usa `pnpm-lock.yaml`. Nunca con `npm i` en la raíz.

## Review Focus

1. **Alguien que no participa pide o escribe en una conversación ajena** (por id): responde 404, como si no existiera, y no recibe sus eventos por socket. La prueba va en la Task 3.
2. **Dos propuestas de acuerdo casi simultáneas sobre el mismo material**: solo una queda activa; la otra responde 409 `AGREEMENT_ACTIVE`. La prueba va en la Task 4.
3. **Fecha u hora inválida** (pasada, domingo, fuera de 7:00–20:59 o en formato raro): responde 400 en español. La prueba va en la Task 4.
4. **Un `BotJob` que ya no aplica** (el material ya no está disponible o el acuerdo ya no está pendiente): se marca hecho sin hacer nada y no se repite. La prueba va en la Task 5.
5. **El socket se cae y vuelve** (por ejemplo, al reiniciar el servidor): al reconectar, la app vuelve a pedir conversaciones, acuerdos y notificaciones, y no pierde mensajes. Se verifica a mano en la Task 7.

---

## Mapa de archivos

```
shared/format.ts, shared/bot-replies.ts
server/src/realtime/socket.ts            ← createRealtime(httpServer, config): Realtime
server/src/notify/notify.ts              ← createNotifier(realtime): Notifier
server/src/modules/notifications/{routes,service}.ts
server/src/modules/conversations/{routes,service,schemas,dto}.ts
server/src/modules/agreements/{routes,service,schemas,dto,rules}.ts
server/src/bots/{worker,jobs,schedule}.ts
server/src/app.ts, server/src/index.ts, server/src/modules/materials/service.ts (programa buyer_interest; emite material:updated)
server/test/{realtime,notifications,conversations,agreements,bots}.test.ts, test/helpers.ts (fakeRealtime)
src/lib/socket.ts (nuevo), src/lib/sync.ts, src/lib/store.ts, src/lib/types.ts, src/lib/data.ts, src/lib/alerts.ts, src/App.tsx
src/screens/{Chat,Agreement,Detail,Activity,Account,Profile,Publish}.tsx
```

---

### Task 1: Textos compartidos (formato y respuestas de bots)

**Files:**
- Create: `shared/format.ts` (`formatDate(iso)` y `formatTime(hhmm)`, con el mismo código de hoy), `shared/bot-replies.ts`
- Modify: `src/lib/store.ts` (re-exporta `formatDate` y `formatTime`), `src/lib/data.ts` (re-exporta `simulatedReply`)
- Test: `server/test/shared.test.ts`

**Interfaces:**
- Produces, en `shared/bot-replies.ts`:
  - `simulatedReply(text: string, material: { status: string; mode: string; price: number; exchangeFor?: string | null }): string`: el mismo código de `src/lib/data.ts`.
  - `buyerReply(botMessagesSoFar: number): string`: devuelve `'¡Genial! ¿Te parece mañana a las 12:30 en la biblioteca central?'` si `< 2`, y `'Perfecto, ahí nos vemos. ¡Gracias! 🙌'` si no.
  - `interestMessage(material: { title: string; mode: string }): string`
  - `BOT_CONFIRMATION = '✅ ¡Confirmado! Nos vemos ahí. Llevaré el material.'`

- [ ] **Step 1: Escribir pruebas que fallan** en `server/test/shared.test.ts`:
  - `formatDate('2026-11-10')` contiene `10` y `nov`.
  - `formatTime('12:30')` contiene `12:30`.
  - `simulatedReply('¿sigue disponible?', disponible)` devuelve la frase de disponible.
  - `simulatedReply('¿me haces precio?', venta de 40)` contiene `S/ 36`.
  - Con un material reservado, `simulatedReply` devuelve la frase de reservado.
  - `buyerReply(0)` y `buyerReply(2)` devuelven las dos frases.
  - `interestMessage` cambia de texto en donación.
- [ ] **Step 2: Ejecutar** y ver el FAIL. **Step 3: Mover el código** y hacer que la app re-exporte. **Step 4:** `npm test` en `server/` y `npx tsc --noEmit -p .` en la raíz: PASS. **Step 5: Commit** con `git commit -m "Textos de formato y respuestas de bots compartidos"`.

---

### Task 2: Tiempo real, `notify()` y notificaciones

**Files:**
- Create: `server/src/realtime/socket.ts`, `server/src/notify/notify.ts`, `server/src/modules/notifications/{routes,service}.ts`, `server/test/realtime.test.ts`, `server/test/notifications.test.ts`
- Modify: `server/src/app.ts` (`AppDeps.realtime`, `AppDeps.notifier`), `server/src/index.ts` (servidor HTTP compartido entre Express y Socket.IO), `server/test/helpers.ts` (`fakeRealtime()`), `server/src/modules/auth/service.ts` y `server/src/modules/materials/service.ts` (la bienvenida y los avisos de búsqueda pasan por `notify`)

**Interfaces:**
- Produces:
  - `type Realtime = { emitToUser(userId: string, event: ServerEvent, payload: unknown): void; isOnline(userId: string): Promise<boolean>; close(): Promise<void> }`, donde `ServerEvent = 'message:new' | 'conversation:read' | 'agreement:updated' | 'material:updated' | 'notification:new'`.
  - `createRealtime(server: http.Server, config: Config): Realtime`. Socket.IO en el mismo puerto, con CORS igual a `config.corsOrigins`. El middleware valida `socket.handshake.auth.token` con `verifyToken` y que el usuario exista y esté verificado; si no, rechaza la conexión con `Error('UNAUTHENTICATED')`. Al conectar, el socket entra a la sala `user:<id>`.
  - `fakeRealtime()` (pruebas) → `Realtime & { events: { userId; event; payload }[]; online: Set<string> }`.
  - `type NotificationDto = { id; category: NotificationCategory; text; link; read: boolean; createdAt: string }`
  - `createNotifier(realtime): { notify(userId: string, n: { category; text; link }): Promise<void> }`. Crea la fila. Si el usuario es bot, termina ahí. Si la categoría está activa en `notificationPrefs`, emite `notification:new` con el `NotificationDto`. El push se agrega en la etapa 5.
  - `GET /api/notifications` 🔒 → `NotificationDto[]` (las 100 más recientes, de más nueva a más vieja). `POST /api/notifications/read-all` 🔒 → 204.
  - `AppDeps` suma `realtime: Realtime` (por defecto, uno nulo que no emite y no tiene usuarios conectados) y `notifier`.

- [ ] **Step 1: Pruebas que fallan.**
  - `realtime.test.ts`: levanta `http.createServer(app)` en el puerto 0 con `createRealtime` y conecta `socket.io-client` (instalar `socket.io socket.io-client` en `server/`).
    - Sin token o con un token inválido, recibe `connect_error` con el mensaje `UNAUTHENTICATED`.
    - Con un token válido conecta, `isOnline(id)` es `true` y `emitToUser(id, 'notification:new', x)` llega a ese socket y no al de otro usuario.
    - Al desconectar, `isOnline` pasa a `false`.
  - `notifications.test.ts`, con `fakeRealtime`:
    - `notify` crea la fila y emite `notification:new` con su DTO.
    - Con la categoría desactivada (`notificationPrefs.categories.mensajes = false`) crea la fila y no emite.
    - Un bot no recibe emisión.
    - `GET /notifications` lista las propias (no las ajenas) de más nueva a más vieja.
    - `read-all` marca todas como leídas.
    - Sin token: 401.
    - Registrarse y verificar crea la bienvenida a través del notifier (llega una emisión si hay socket).
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** `index.ts` crea `http.createServer(app)`, pasa `realtime` a `createApp` mediante `deps` y hace `listen`. **Step 4:** `npm test` y `npm run typecheck`: PASS. **Step 5: Commit** con `git commit -m "Servidor: Socket.IO, notify() y notificaciones"`.

---

### Task 3: Conversaciones y mensajes

**Files:**
- Create: `server/src/modules/conversations/{schemas,dto,service,routes}.ts`, `server/test/conversations.test.ts`

**Interfaces:**
- Consumes: `Realtime`, `Notifier`, `MaterialDto`, `OwnerDto` y `toMaterialDtos`.
- Produces:
  - `type MessageDto = { id; conversationId; senderId; text; createdAt: string }`
  - `type ConversationDto = { id; materialId; buyerId; sellerId; buyerReadAt: string | null; sellerReadAt: string | null; lastMessageAt: string; lastMessage: MessageDto | null; unread: number; material: MaterialDto; other: OwnerDto }`
  - `POST /api/conversations` 🔒 con `{ materialId }` → 200 o 201 `ConversationDto` (la existente o una nueva; el comprador es el usuario y el vendedor, el dueño). El material debe estar `Disponible` o `Reservado`. Uno propio responde 400 `OWN_MATERIAL` con `'Es tu propia publicación.'`.
  - `GET /api/conversations` 🔒 → `ConversationDto[]`, por `lastMessageAt` de más reciente a más antigua.
  - `GET /api/conversations/:id/messages?before=<ISO>` 🔒 → `MessageDto[]`, de más viejo a más nuevo; como máximo 50 anteriores a `before`.
  - `POST /api/conversations/:id/messages` 🔒 con `{ text: 1–1000, trim }` → 201 `MessageDto`.
    - Actualiza `lastMessageAt` y la lectura del remitente, y emite `message:new` `{ conversationId, message }` a **ambos** participantes.
    - Llama a `notify(otro, { category: 'mensajes', link: '#/chat/<id>', text: '<Nombre> te escribió: “<texto hasta 80 caracteres…>”' })`.
    - Si el otro es bot, programa un `reply` (Task 5 lo implementa mediante `scheduleBotReply(conversation)`; hasta entonces es una función vacía exportada por `bots/schedule.ts`).
  - `POST /api/conversations/:id/read` 🔒 → 204. Fija la lectura del usuario y emite `conversation:read` `{ conversationId, userId, readAt }` al otro.
  - `type ConversationService = { sendMessage(conversationId, senderId, text): Promise<MessageDto>; open(materialId, buyerId): Promise<ConversationDto> }` (los bots las usan).
  - Error común: si no participa o el id no existe, responde 404 `CONVERSATION_NOT_FOUND` con `'Esta conversación ya no existe.'`.

- [ ] **Step 1: Pruebas que fallan**, con `fakeRealtime`, `seed` y dos usuarios reales (Ana vende un material propio; Beto compra):
  - Abrir dos veces devuelve la misma conversación. No se puede abrir una sobre un material propio, ni sobre uno `Pausado` o `Entregado` (404 o 400).
  - Enviar responde 201, emite `message:new` a los dos, crea una notificación para Ana con el texto esperado y deja `unread: 1` en la lista de Ana y `0` en la de Beto.
  - `read` deja en 0 los no leídos de Ana y emite `conversation:read` a Beto.
  - Un tercer usuario (Carla) recibe 404 en `GET messages`, `POST messages` y `read`, y no recibe eventos.
  - El texto vacío o de solo espacios y uno de 1001 caracteres responden 400.
  - Paginación: con 60 mensajes, sin `before` llegan los 50 últimos en orden ascendente; con `before` = el primero de esos, llegan los 10 restantes.
  - La lista trae `material` y `other` (nombre y reputación del otro).
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** PASS. **Step 5: Commit** con `git commit -m "Servidor: conversaciones y mensajes en tiempo real"`.

---

### Task 4: Acuerdos de entrega y reseñas

**Files:**
- Create: `server/src/modules/agreements/{rules,schemas,dto,service,routes}.ts`, `server/test/agreements.test.ts`
- Modify: `server/src/modules/materials/service.ts` (exporta `emitMaterialUpdated(materialId, status)`, que avisa a los participantes de las conversaciones del material)

**Interfaces:**
- Produces:
  - `rules.ts` → `checkSchedule(date: string, time: string, now = new Date()): string | null`. Devuelve el mensaje de error o `null`:
    - formato `YYYY-MM-DD` y `HH:mm` válidos; si no, `'Elige una fecha y hora válidas.'`;
    - no antes de ahora en Lima: `'Elige una fecha y hora que todavía no hayan pasado.'`;
    - hora entre 07:00 y 20:59: `'Para tu seguridad, elige un horario de clases (7:00 a. m. a 9:00 p. m.).'`;
    - no domingo: `'El campus no atiende los domingos. Elige otro día.'`.
  - `type AgreementDto = { id; materialId; buyerId; sellerId; place; date; time; note?: string; status; createdAt; updatedAt; review: { stars; comment; createdAt } | null }`
  - `POST /api/agreements` 🔒 con `{ materialId, place ∈ SAFE_POINTS.name, date, time, note?: ≤ 300 }` → 201 `AgreementDto`. Reglas:
    - El comprador no es el dueño (400 `OWN_MATERIAL`) y el material está `Disponible` (409 `MATERIAL_UNAVAILABLE` con `'Este material ya no está disponible.'`).
    - No hay otro acuerdo `Pendiente` o `Confirmado` para el material: 409 `AGREEMENT_ACTIVE` con `'Ya hay una entrega en curso para este material.'`. Se garantiza con una transacción `Serializable` y, ante un conflicto de serialización, el 409.
    - Abre (o reutiliza) la conversación y envía en ella el mensaje de propuesta a nombre del comprador, usando `sendMessage`.
    - Notifica al vendedor (`acuerdos`): `'<Nombre> propuso entregar “<título>” en <lugar>.'`, con link `#/acuerdo/<id>`.
    - Si el vendedor es bot, `scheduleBotConfirm(agreement)`.
  - `POST /api/agreements/:id/confirm` 🔒: solo el vendedor y solo desde `Pendiente`. Pasa a `Confirmado` y el material a `Reservado`. Notifica al comprador con `'<Nombre> confirmó la entrega en <lugar>.'`.
  - `POST /api/agreements/:id/cancel` 🔒: cualquiera de los dos, desde `Pendiente` o `Confirmado`. Pasa a `Cancelado`; si el material estaba `Reservado`, vuelve a `Disponible`. Notifica al otro con `'<Nombre> canceló la entrega de “<título>”.'`.
  - `POST /api/agreements/:id/complete` 🔒: solo el comprador y solo desde `Confirmado`. Pasa a `Completado` y el material a `Entregado`. Notifica al vendedor con `'<Nombre> confirmó que recibió “<título>”.'`.
  - `POST /api/agreements/:id/review` 🔒 con `{ stars: int 1–5, comment: ≤ 500 }`: solo el comprador y solo si está `Completado`. Crea la `Review` con `authorName` y `materialTitle`. Otra vez: 409 `ALREADY_REVIEWED` con `'Ya valoraste esta entrega.'`.
  - `GET /api/agreements` 🔒 → mis acuerdos (como comprador o vendedor), por `updatedAt` de más reciente a más antiguo.
  - Errores comunes:
    - Si no participa: 404 `AGREEMENT_NOT_FOUND` con `'No encontramos este acuerdo.'`.
    - Si participa pero no le corresponde la acción: 403 `FORBIDDEN` con `'Esta acción le corresponde a la otra persona.'`.
    - Transición inválida: 409 `INVALID_TRANSITION`.
  - Cada cambio emite `agreement:updated` `{ agreement }` a los dos y, si cambia el material, `material:updated` `{ materialId, status }` a todos los participantes de sus conversaciones.
  - `type AgreementService = { confirm(id, sellerId): Promise<AgreementDto> }` (lo usan los bots).

- [ ] **Step 1: Pruebas que fallan:**
  - `checkSchedule`: un caso válido y uno para cada error. Fijar `now` en un martes a las 10:00 de Lima; las fechas se arman con zona `-05:00`.
  - El flujo completo proponer → confirmar → completar → reseñar cambia los estados del acuerdo y del material, envía 4 notificaciones (vendedor, comprador, vendedor y ninguna por la reseña), y la reputación de Ana en `GET /users/:id` pasa a `{ value: 5, count: 1 }`.
  - El mensaje de propuesta aparece en la conversación con el texto exacto (fecha y hora con `formatDate`/`formatTime`).
  - Dos `POST /agreements` en paralelo (`Promise.all`) sobre el mismo material de dos compradores distintos: una respuesta 201 y otra 409, y queda un solo acuerdo activo.
  - Permisos: el comprador no puede confirmar (403), el vendedor no puede completar (403), Carla recibe 404 en todo y nadie puede reseñar dos veces (409).
  - Cancelar un acuerdo confirmado devuelve el material a `Disponible`, y después se puede proponer otro acuerdo.
  - Lugar fuera de los puntos seguros: 400. Material `Reservado` por otro acuerdo: 409.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** PASS. **Step 5: Commit** con `git commit -m "Servidor: acuerdos de entrega y reseñas"`.

---

### Task 5: Estudiantes simulados en el servidor

**Files:**
- Create: `server/src/bots/schedule.ts` (rellena las funciones vacías de las tasks 3 y 4), `server/src/bots/jobs.ts`, `server/src/bots/worker.ts`, `server/test/bots.test.ts`
- Modify: `server/src/index.ts` (inicia el worker si `config.botsEnabled`), `server/src/modules/materials/service.ts` (al crear el material de un usuario real, `scheduleBuyerInterest`)

**Interfaces:**
- Produces:
  - Funciones de `schedule.ts`. Todas crean un `BotJob` y no hacen nada si `botsEnabled` es `false`:
    - `scheduleBotReply(conversation)`: `kind: 'reply'`, `payload { conversationId, botId }`, `dueAt` entre ahora + 3 s y ahora + 8 s.
    - `scheduleBotConfirm(agreement)`: `kind: 'confirm_agreement'`, `payload { agreementId }`, entre 10 s y 20 s.
    - `scheduleBuyerInterest(material)`: `kind: 'buyer_interest'`, `payload { materialId }`, entre 30 s y 60 s.
  - `runDueJobs(now = new Date(), deps): Promise<number>`. Toma los trabajos con `doneAt` nulo y `dueAt <= now`, los marca `doneAt = now` **antes** de ejecutarlos (para no repetirlos) y devuelve cuántos ejecutó. Si uno falla, registra el error y sigue con el resto.
    - **reply:** si el bot es el vendedor, responde con `simulatedReply(último mensaje del humano, material)`; si es el comprador, con `buyerReply(mensajes del bot hasta ahora)`. Envía con `sendMessage`.
    - **confirm_agreement:** solo si el acuerdo sigue `Pendiente`. Confirma con `AgreementService.confirm` y envía `BOT_CONFIRMATION` en la conversación.
    - **buyer_interest:** solo si el material sigue `Disponible`. Un bot al azar abre la conversación con `open` y envía `interestMessage`.
  - `startBotWorker(deps, intervalMs = 5000): () => void`: devuelve una función para detenerlo.

- [ ] **Step 1: Pruebas que fallan** (`botsEnabled: true`; se llama a `runDueJobs(futuro)` en lugar de esperar):
  - Escribirle a María crea un `reply`. `runDueJobs(+10 s)` hace que María responda la frase esperada, emite `message:new` y notifica al humano.
  - Proponer un acuerdo a María y ejecutar `runDueJobs(+30 s)` lo deja `Confirmado`, el material `Reservado`, con el mensaje de confirmación en el chat.
  - Publicar como usuario real y ejecutar `runDueJobs(+70 s)` hace que un bot abra la conversación con el mensaje de interés y que el dueño reciba la notificación.
  - Trabajos que ya no aplican: si se cancela el acuerdo antes de ejecutar `confirm_agreement`, o se pausa el material antes de `buyer_interest`, `runDueJobs` los marca hechos sin cambiar nada. Un segundo `runDueJobs` devuelve 0.
  - Con `botsEnabled: false` no se crean trabajos.
- [ ] **Step 2: Ver el FAIL. Step 3: Implementar.** **Step 4:** PASS. **Step 5: Commit** con `git commit -m "Servidor: estudiantes simulados con BotJob y worker"`.

---

### Task 6: App: datos de chat, acuerdos y notificaciones desde el servidor

**Files:**
- Create: `src/lib/socket.ts`
- Modify: `package.json` (`npx pnpm@10.34.3 add socket.io-client`), `src/lib/types.ts`, `src/lib/data.ts` (`STATE_VERSION = 3`; sin `scheduled`), `src/lib/sync.ts`, `src/lib/store.ts`, `src/lib/alerts.ts`, `src/App.tsx`

**Interfaces:**
- Produces:
  - `types.ts`:
    - `Conversation` suma `unread?: number`; `participants` sigue siendo `[buyerId, sellerId]`, y `readAt` se arma desde `buyerReadAt` y `sellerReadAt`.
    - Se eliminan `ScheduledEvent` y `State.scheduled`.
    - `Agreement.rating` se arma desde `review`.
  - `sync.ts` suma:
    - `loadConversations()`: hace upsert de las conversaciones con `messages` = el último mensaje si aún no hay mensajes en la caché; adopta `material` y `other`.
    - `loadMessages(conversationId)`: reemplaza `messages`.
    - `loadAgreements()`
    - `loadNotifications()`
    - `adoptMessage(conversationId, MessageDto)`, sin duplicar por id.
    - `adoptAgreement(AgreementDto)`
    - `syncAll()` también llama a los tres nuevos `load*`.
  - `socket.ts`:
    - `connectSocket(token)` y `disconnectSocket()`. Usa `io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] })`.
    - Manejadores:
      - `message:new` → `adoptMessage` (o `loadConversations` si la conversación no está en la caché);
      - `conversation:read` → actualiza `readAt`;
      - `agreement:updated` → `adoptAgreement`;
      - `material:updated` → actualiza el estado en la caché;
      - `notification:new` → agrega la notificación (el `subscribe` de `alerts.ts` la muestra).
    - En el evento `connect` **después del primero** (reconexión) llama a `syncAll()`.
  - Acciones de `store.ts`, ahora `async` contra la API. Si fallan, muestran el error en español y devuelven `null` o `false`:
    - `openConversation(materialId): Promise<string | null>`
    - `sendMessage(conversationId, text): Promise<boolean>`
    - `markConversationRead(id)` (sin esperar respuesta)
    - `proposeAgreement(input): Promise<string | null>`
    - `confirmAgreement(id)` (nueva, para el vendedor), `cancelAgreement(id)`, `confirmReception(id)` y `rateAgreement(id, stars, comment)`, todas `Promise<boolean>`
    - `markNotificationsRead()`
  - Se eliminan `processScheduled`, `applyEvent`, `eventNotice`, `noticeId`, `buyerReply` local y la programación local de `buyer-interest` en `publishMaterial`.
  - `userRating` y las reseñas del perfil usan **solo** el servidor (las valoraciones de acuerdos ya son reseñas del servidor; sumarlas las contaría dos veces).
  - `alerts.ts`: se eliminan `scheduleBackgroundAlerts`/`cancelBackgroundAlerts` y el uso de `eventNotice`. Se mantienen `alertInApp` y `postNow` para los avisos que llegan con la app en segundo plano. El push con la app cerrada llega en la etapa 5.
  - `App.tsx`: se elimina el intervalo de `processScheduled`. Con sesión, `connectSocket(getToken())`; al cerrar sesión, `disconnectSocket()`.

- [ ] **Step 1: Implementar.** **Step 2:** `npx tsc --noEmit -p .` y `npx vite build`, sin errores. **Step 3: Commit** con `git commit -m "App: chat, acuerdos y notificaciones desde el servidor (datos y socket)"`.

---

### Task 7: App: pantallas y verificación de punta a punta

**Files:**
- Modify: `src/screens/Chat.tsx` (`useRefresh(() => loadMessages(id), [id])`, envío asíncrono que deshabilita el botón), `src/screens/Agreement.tsx` (botón **"Confirmar entrega"** para el vendedor en `Pendiente`; todas las acciones esperan al servidor), `src/screens/Detail.tsx` ("Contactar" espera a `openConversation`), `src/screens/Activity.tsx` (no leídos desde `unread`; `useRefresh(loadConversations)`), `src/screens/Account.tsx` (`markNotificationsRead` contra la API), `src/screens/Profile.tsx` (reseñas solo del servidor), `src/screens/Publish.tsx` (sin programación local)

- [ ] **Step 1: Implementar.** **Step 2:** `npx tsc --noEmit -p .` y `npx vite build`.
- [ ] **Step 3: Verificar en el navegador** (A en la app, B = Beto por el script de API; luego B en la app):
  1. A escribe a María (bot): la respuesta llega sola en 3–8 s, sin recargar, con la ventana emergente.
  2. A propone una entrega a María: en 10–20 s pasa a "Confirmado", con el mensaje del bot en el chat. A confirma la recepción y deja 5 estrellas; el perfil de María suma la reseña.
  3. A publica un material: en 30–60 s un bot le escribe y aparece la notificación.
  4. B (por API) escribe en un material de A: el mensaje llega a A en vivo y "Mi actividad" muestra 1 no leído. A responde y B lo ve en `GET messages`.
  5. B propone una entrega. A la ve en "Acuerdos" con el botón "Confirmar entrega", confirma, y B recibe el estado. B completa y reseña (por API); el perfil de A muestra la reseña.
  6. Se reinicia el servidor con la app abierta: al volver, un mensaje enviado por B mientras tanto aparece sin recargar (reconexión y `syncAll`).
  7. Notificaciones: la lista viene del servidor y "marcar como leídas" persiste al recargar.
  8. Sin errores en la consola, salvo los provocados a propósito.
- [ ] **Step 4: Commit** con `git commit -m "App: pantallas de chat, acuerdos y notificaciones contra el servidor"`.

---

### Task 8: Documentación

- [ ] Actualizar:
  - `docs/backend-explicado.md`: estado de las etapas 3 y 4; §7.3 a §7.6 con lo construido; y en preguntas probables, cómo se evita la doble reserva.
  - El spec: §9 indica que las etapas 3 y 4 se hicieron juntas, y se ajustan los textos de las notificaciones.
  - `server/README.md`: `BOTS_ENABLED` y cómo ver los bots en acción.
- [ ] Commit con `git commit -m "Docs: etapas 3 y 4 del backend"`.
