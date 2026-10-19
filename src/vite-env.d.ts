/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_SRC?: string;
  readonly VITE_ANALYTICS_DOMAIN?: string;
  readonly VITE_SHOT_ENDPOINT?: string;
  readonly VITE_TURNSTILE_SITEKEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
