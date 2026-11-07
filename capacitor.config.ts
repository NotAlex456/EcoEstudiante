import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ecoestudiante.app',
  appName: 'EcoEstudiante',
  webDir: 'dist',
  android: {
    backgroundColor: '#f5f7f3',
  },
  plugins: {
    SystemBars: {
      // The page uses viewport-fit=cover and env(safe-area-inset-*) for the status/navigation bars.
      initialViewportFitValueHint: 'cover',
      // Dark icons over the app's light background.
      style: 'LIGHT',
    },
  },
}

export default config
