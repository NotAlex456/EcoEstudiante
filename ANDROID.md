# EcoEstudiante para Android (APK)

La app web se empaqueta con [Capacitor](https://capacitorjs.com/) dentro de un APK que funciona sin internet
(solo las fotos de ejemplo se descargan de la web). Los datos se guardan en cada celular.

## Herramientas (ya instaladas en esta PC)

| Herramienta | Ubicación |
| --- | --- |
| JDK 21 (Gradle no funciona con Java 25) | `C:\Users\holac\android-tools\jdk-21.0.13+9` |
| Android SDK (plataforma 36, build-tools 35) | `C:\Users\holac\android-tools\sdk` |

Gradle usa el JDK 21 gracias a `org.gradle.java.home` en `%USERPROFILE%\.gradle\gradle.properties` (configuración
de esta PC, fuera del proyecto), y encuentra el SDK por `android/local.properties` (también fuera de git). En otra PC
basta con tener Android Studio instalado, o crear esos dos archivos con las rutas de esa PC.

## Generar un APK nuevo después de cambiar la app

```bash
npx pnpm android:apk
```

El APK firmado queda en `android/app/build/outputs/apk/release/app-release.apk`.

Antes de compartir una versión nueva, sube `versionCode` (y `versionName`) en `android/app/build.gradle`;
si no, Android no la instala encima de la anterior.

## Llave de firma: ¡no la pierdas!

- `android/ecoestudiante-release.jks` y `android/keystore.properties` (con su contraseña) firman la app.
- Están fuera de git a propósito. **Guarda una copia de ambos archivos** (por ejemplo en tu Drive).
- Si se pierden, las próximas versiones no podrán instalarse encima: habrá que desinstalar la app y se
  perderán los datos guardados en el celular.

## Instalar en un celular

1. Envía el `.apk` por WhatsApp, Drive o cable.
2. Ábrelo en el celular y permite "Instalar apps desconocidas" para esa app cuando Android lo pida.
3. Google Play Protect puede mostrar un aviso por ser una app que no viene de Play Store: elige
   "Instalar de todas formas".

## Notificaciones

- El tono está en `public/sounds/notificacion.mp3` (dentro de la app) y en
  `android/app/src/main/res/raw/eco_alerta.mp3` (avisos de Android con la app cerrada). Para cambiarlo,
  reemplaza **ambos** archivos con el mismo nombre.
- Android guarda el sonido de cada canal la primera vez que se crea: si cambias el tono, cambia también los
  ids de canal en `src/lib/alerts.ts` (`channelId`) o desinstala la app antes de instalar la nueva versión.
- `res/raw/eco_silencio.wav` es un audio mudo para el canal sin sonido.
