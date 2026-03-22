import type { BigIDEApi } from "@/types/big-ide";

import { createWebBigIDEApi } from "@/lib/web-big-ide-api";

let cachedWebApi: BigIDEApi | null = null;

export function ensureRuntimeApi() {
  if (window.bigIDE) {
    return window.bigIDE;
  }

  if (!cachedWebApi) {
    cachedWebApi = createWebBigIDEApi();
  }

  window.bigIDE = cachedWebApi;
  return cachedWebApi;
}
