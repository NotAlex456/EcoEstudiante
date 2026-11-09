/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del servidor de EcoEstudiante, por ejemplo http://localhost:3000 */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
