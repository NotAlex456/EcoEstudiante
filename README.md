# EcoEstudiante

Aplicación móvil para que los estudiantes de la **UPSJB – Chincha** compren a bajo costo, intercambien o donen
materiales académicos (libros, apuntes, calculadoras y separatas) y así reutilicen recursos dentro del campus.

> **Autor:** Deyver Martínez · **Curso:** _(nombre del curso)_ · **Docente:** _(nombre del docente)_

## Probar la app

- **Android:** descarga `EcoEstudiante-1.3.apk` desde la sección **Releases** de este repositorio e instálalo
  (Android 7.0 o superior; permite "instalar apps desconocidas" cuando el teléfono lo pida).
- **Navegador:** sigue los pasos de [Ejecutar en una computadora](#ejecutar-en-una-computadora).

Es un prototipo funcional **sin servidor**: todo se guarda en el propio dispositivo y los demás estudiantes son
simulados (responden mensajes, confirman entregas y se interesan por lo que publicas), para poder recorrer el flujo
completo con una sola persona.

## Funcionalidades

| Área | Qué incluye |
| --- | --- |
| Cuenta | Registro solo con correo institucional `@upsjb.edu.pe`, verificación por código, inicio de sesión, edición de perfil |
| Explorar | Búsqueda, categorías, filtros (modalidad, carrera, ciclo, estado, precio máximo), materiales guardados y alertas de búsqueda |
| Publicar | Venta, intercambio o donación, con fotos (comprimidas en el teléfono), edición, pausa y eliminación |
| Chat | Conversación por material, mensajes no leídos y respuestas de los estudiantes simulados |
| Acuerdos de entrega | Propuesta de lugar seguro del campus, fecha y hora; confirmación, recepción y valoración con estrellas |
| Reputación | Perfil público de cada estudiante con su calificación y reseñas |
| Seguridad | Puntos seguros de entrega, normas de la comunidad y reporte de publicaciones |
| Notificaciones | Ventana emergente con sonido y vibración; notificaciones de Android con la app cerrada; ajustes por tipo de aviso y horario silencioso |
| Accesibilidad | Tamaño de texto, alto contraste, texto en negrita, espaciado de lectura y reducción de animaciones |
| Instalación | APK de Android y aplicación web instalable (PWA) que funciona sin conexión |

## Tecnologías

- **React 19** + **TypeScript** + **Vite** (interfaz)
- **Tailwind CSS 4** y CSS propio (estilos)
- **Capacitor 8** (empaquetado como app de Android), con los plugins de notificaciones locales, vibración y estado
  de la app
- `localStorage` como base de datos local del dispositivo

## Estructura del proyecto

```
src/
  main.tsx              Punto de entrada
  App.tsx               Navegación principal (barra lateral, barra inferior, rutas)
  screens/              Una pantalla por archivo: Auth, Explore, Detail, Chat, Agreement,
                        Publish, Activity, Account, Profile, Settings
  components/ui.tsx     Componentes reutilizables (botones, tarjetas, íconos, interruptores…)
  lib/
    store.ts            Estado de la app, guardado local y simulación de los otros estudiantes
    data.ts             Datos de ejemplo (estudiantes, materiales, puntos seguros, normas)
    types.ts            Tipos de datos (usuario, material, conversación, acuerdo…)
    router.ts           Rutas con # para que funcione el botón Atrás del teléfono
    alerts.ts           Ventana emergente, sonido y notificaciones de Android
    settings.ts         Preferencias de notificaciones y accesibilidad
  index.css, app.css    Estilos
public/                 Íconos, manifiesto PWA, service worker y sonido de notificación
android/                Proyecto nativo de Android generado por Capacitor
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

Para crear una cuenta usa cualquier correo con el formato `nombre.apellido@upsjb.edu.pe`; el código de verificación
aparece en pantalla porque no hay servidor de correo.

## Generar el APK

Los pasos están en [ANDROID.md](ANDROID.md). En resumen, con Android Studio (o el JDK 21 y el SDK de Android)
instalado:

```bash
npx pnpm android:apk
```

## Limitaciones conocidas

- Sin servidor: cada teléfono tiene sus propios datos y los demás estudiantes son simulados. Para que varias personas
  reales compartan publicaciones y chats haría falta una base de datos en línea (por ejemplo Firebase o Supabase).
- Las fotos de ejemplo se cargan desde internet; el resto de la app funciona sin conexión.
