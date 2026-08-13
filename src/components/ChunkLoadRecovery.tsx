"use client";

import { useEffect } from "react";

export const CHUNK_RELOAD_STORAGE_KEY = "cloud-palette:chunk-reload-at";

const RELOAD_COOLDOWN_MS = 60_000;
const CHUNK_FAILURE_PATTERN =
  /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;

function hardReload() {
  window.location.reload();
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return typeof value === "string" ? value : "";
}

function isNextChunk(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLScriptElement &&
    target.src.includes("/_next/static/chunks/")
  );
}

export function ChunkLoadRecovery({
  reload = hardReload,
}: {
  reload?: () => void;
}) {
  useEffect(() => {
    const recover = (value: unknown) => {
      if (!CHUNK_FAILURE_PATTERN.test(errorMessage(value))) {
        return;
      }

      const now = Date.now();
      let lastReload = 0;

      try {
        lastReload =
          Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)) || 0;
      } catch {
        // Storage が無効でも、この一度の再読み込みによる回復は試みる。
      }

      if (now - lastReload < RELOAD_COOLDOWN_MS) {
        return;
      }

      try {
        sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      } catch {
        // Storage が無効な環境では記録できないが、再読み込みは続行する。
      }

      reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isNextChunk(event.target)) {
        recover("ChunkLoadError");
        return;
      }

      recover(event.error ?? event.message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      recover(event.reason);
    };

    // script 要素の取得失敗は bubble しないため capture で受け取る。
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [reload]);

  return null;
}
