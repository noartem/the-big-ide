/// <reference types="vite/client" />

import type { BigIDEApi } from "@/types/big-ide";

interface ImportMetaEnv {
  readonly VITE_BIGIDE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    bigIDE?: BigIDEApi;
  }
}

export {};
