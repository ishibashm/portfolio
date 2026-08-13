import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHUNK_RELOAD_STORAGE_KEY,
  ChunkLoadRecovery,
} from "@/components/ChunkLoadRecovery";

function rejected(reason: unknown): Event {
  const event = new Event("unhandledrejection");
  Object.defineProperty(event, "reason", { value: reason });
  return event;
}

describe("古いデプロイの JS チャンクから自動回復する", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("ChunkLoadError なら一度だけ再読み込みする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T11:00:00Z"));
    const reload = vi.fn();
    render(<ChunkLoadRecovery reload={reload} />);

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "ChunkLoadError: Loading chunk app/admin/metrics/page failed.",
      }),
    );
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "ChunkLoadError: Loading chunk app/admin/metrics/page failed.",
      }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBe(
      String(Date.now()),
    );
  });

  it("動的 import の取得失敗も回復対象にする", () => {
    const reload = vi.fn();
    render(<ChunkLoadRecovery reload={reload} />);

    window.dispatchEvent(
      rejected(new TypeError("Failed to fetch dynamically imported module")),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Next.js の script 取得失敗も回復対象にする", () => {
    const reload = vi.fn();
    render(<ChunkLoadRecovery reload={reload} />);
    const script = document.createElement("script");
    script.src = "/_next/static/chunks/app/admin/metrics/page-old.js";
    document.body.appendChild(script);

    script.dispatchEvent(new Event("error"));

    expect(reload).toHaveBeenCalledTimes(1);
    script.remove();
  });

  it("通常の画面バグでは再読み込みしない", () => {
    const reload = vi.fn();
    render(<ChunkLoadRecovery reload={reload} />);

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "TypeError: Cannot read properties of undefined",
      }),
    );

    expect(reload).not.toHaveBeenCalled();
  });
});
