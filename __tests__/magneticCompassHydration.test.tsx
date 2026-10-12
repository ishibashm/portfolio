import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MagneticCompass } from "@/components/houi/MagneticCompass";

const device = vi.hoisted(() => ({ webgl: false }));
vi.mock("@/lib/webglSupport", () => ({ supportsWebGL: () => device.webgl }));
vi.mock("next/dynamic", () => ({ default: () => () => <div>立体の図</div> }));

it("立体表示できる端末でもサーバーの平面表示を描き直さずに接続する", async () => {
  const container = document.createElement("div");
  device.webgl = false;
  container.innerHTML = renderToString(<MagneticCompass />);
  device.webgl = true;
  document.body.append(container);
  const before = container.querySelector("section");
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, <MagneticCompass />, {
        onRecoverableError,
      });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("section")).toBe(before);
    expect(container.textContent).toContain("立体の図");
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
