# EcoEstudiante

Aplicación móvil para que los estudiantes de la **UPSJB – Chincha** compren a bajo costo, intercambien o donen
materiales académicos (libros, apuntes, calculadoras y separatas) y así reutilicen recursos dentro del campus.

> **Autor:** Deyver Martínez · **Curso:** Creatividad Digital · **Docente:** Ivan Eduardo Anchante Reyes


## Probar la app

- **Android:** descarga `EcoEstudiante-2.1.apk` desde la sección **Releases** de este repositorio e instálalo
  (Android 7.0 o superior; permite "instalar apps desconocidas" cuando el teléfono lo pida).
- **Navegador:** abre https://ecoestudiante.onrender.com desde la PC o el celular. Es la misma app del APK, salvo los
  avisos push, que solo existen en Android.

Desde la versión 2.0 la app usa un **servidor propio** publicado en https://ecoestudiante-api.onrender.com. Todos los estudiantes ven las mismas
publicaciones, chatean en tiempo real y reciben avisos aunque la app esté cerrada. Además hay estudiantes
**simulados** que responden mensajes, confirman entregas y se interesan por lo que publicas, para poder recorrer el
flujo completo con una sola persona.

La primera apertura puede tardar 30–50 s ("Conectando con el servidor…"), porque el servidor gratuito se duerme
cuando no se usa. El código de verificación llega por correo; si no lo ves, revisa la carpeta de spam.

El backend está explicado en detalle en [docs/backend-explicado.md](docs/backend-explicado.md), y cómo ejecutarlo,
en [server/README.md](server/README.md).

## Funcionalidades

| Área | Qué incluye |
| --- | --- |
| Cuenta | Registro con correo institucional `@upsjb.edu.pe` (y correos de confianza permitidos), verificación por código, recuperación de contraseña, edición de perfil |
| Explorar | Búsqueda, categorías, filtros (modalidad, carrera, ciclo, estado, precio máximo), materiales guardados y alertas de búsqueda |
| Publicar | Venta, intercambio o donación, con fotos (comprimidas en el teléfono), edición, pausa y eliminación |
| Chat | Conversación por material, mensajes no leídos y respuestas de los estudiantes simulados |
| Acuerdos de entrega | Propuesta de lugar seguro del campus, fecha y hora; confirmación, recepción y valoración con estrellas |
| Reputación | Perfil público de cada estudiante con su calificación y reseñas |
| Seguridad | Puntos seguros de entrega, normas de la comunidad y reporte de publicaciones |
| Notificaciones | Ventana emergente con sonido y vibración; notificaciones de Android con la app cerrada; ajustes por tipo de aviso y horario silencioso |
| Accesibilidad | Tamaño de texto, alto contraste, texto en negrita, espaciado de lectura y reducción de animaciones |
| Instalación | APK de Android y aplicación web instalable (PWA) que funciona sin conexión |
| Administración | Panel web en `/admin` para ocultar publicaciones, resolver reportes y bloquear usuarios |

## Tecnologías

- **React 19** + **TypeScript** + **Vite** (interfaz)
- **Tailwind CSS 4** y CSS propio (estilos)
- **Capacitor 8** (empaquetado como app de Android), con los plugins de notificaciones locales, vibración y estado
  de la app
- `localStorage` como caché local, para abrir rápido y ver lo último sin conexión
- **Servidor** (`server/`): Node.js + TypeScript, Express 5, Prisma, PostgreSQL, Socket.IO y Firebase Cloud
  Messaging. Desplegado en Render + Neon, con fotos en Cloudinary y correos con Brevo

## Estructura del proyecto

```
src/
  main.tsx              Punto de entrada
  App.tsx               Navegación principal (barra lateral, barra inferior, rutas)
  screens/              Una pantalla por archivo: Auth, Explore, Detail, Chat, Agreement,
                        Publish, Activity, Account, Profile, Settings
  components/ui.tsx     Componentes reutilizables (botones, tarjetas, íconos, interruptores…)
  lib/
    store.ts            Estado de la app (caché local) y acciones contra el servidor
    api.ts, sync.ts     Cliente HTTP del servidor y sincronización de la caché
    socket.ts           Conexión en vivo (Socket.IO): mensajes, acuerdos y avisos al instante
    push.ts             Registro del celular para los avisos push (Firebase)
    data.ts             Datos de ejemplo (estudiantes, materiales, puntos seguros, normas)
    types.ts            Tipos de datos (usuario, material, conversación, acuerdo…)
    router.ts           Rutas con # para que funcione el botón Atrás del teléfono
    alerts.ts           Ventana emergente, sonido y notificaciones de Android
    settings.ts         Preferencias de notificaciones y accesibilidad
  index.css, app.css    Estilos
public/                 Íconos, manifiesto PWA, service worker y sonido de notificación
android/                Proyecto nativo de Android generado por Capacitor
server/                 Servidor (API REST, base de datos, tiempo real, push y estudiantes simulados)
docs/                   Documentación del backend, spec y planes
render.yaml             Despliegue del servidor en Render
ANDROID.md              Cómo generar el APK
```

## Ejecutar en una computadora

Requiere [Node.js](https://nodejs.org/) 20 o superior.

```bash
npx pnpm install
npx pnpm dev
```

Luego abre la dirección que aparece (por ejemplo `http://localhost:5173`). Para verla como en un celular, usa el
modo de dispositivo móvil del navegador (F12 › ícono de teléfono).

La app necesita el servidor. Para usarlo en la misma computadora, inícialo siguiendo
[server/README.md](server/README.md) (`npm run db` y `npm run dev` en `server/`) y crea un archivo `.env.local` en
la raíz con `VITE_API_URL=http://localhost:3000`. Sin servicio de correo configurado, el código de verificación
aparece en la consola del servidor y en la pantalla de la app.

## Generar el APK

Los pasos están en [ANDROID.md](ANDROID.md). En resumen, con Android Studio (o el JDK 21 y el SDK de Android)
instalado:

```bash
npx pnpm android:apk
```

## Limitaciones conocidas

- El servidor gratuito se duerme tras 15 minutos sin uso: la primera petición tarda unos 30–50 s.
- Los correos de verificación pueden llegar a spam (se envían desde un Gmail, sin dominio propio).
- Los avisos con la app cerrada funcionan en el APK de Android; en el navegador solo con la página abierta.
- Sin conexión se puede ver lo último cargado, pero publicar o chatear requiere internet.
