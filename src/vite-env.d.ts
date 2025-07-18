/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALGOLIA_APP_ID: string
  readonly VITE_ALGOLIA_SEARCH_API_KEY: string
  readonly VITE_ALGOLIA_ADMIN_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  var FIREBASE_FUNCTIONS_EMULATOR_CONNECTED: boolean;
}