import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GreatCircleGlobe } from "@/components/houi/GreatCircleGlobe";
import { MagneticCompass } from "@/components/houi/MagneticCompass";

const device = vi.hoisted(() => ({ webgl: false }));
vi.mock("@/lib/webglSupport", () => ({ supportsWebGL: () => device.webgl }));
vi.mock("next/dynamic", () => ({ default: () => () => <div>立体の図</div> }));

it.each([MagneticCompass, () => <GreatCircleGlobe areas={[]} />])(
  "立体表示できる端末でもサーバーの未選択表示に接続する",
  async (Component) => {
    const container = document.createElement("div");
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ base_lat: 35.1709, base_lon: 136.8815 }),
    );
    device.webgl = false;
    container.innerHTML = renderToString(<Component />);
    expect(container.querySelector("select")?.value).toBe("");
    device.webgl = true;
    document.body.append(container);
    const before = container.querySelector("section");
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Component />, {
          onRecoverableError,
        });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector("section")).toBe(before);
      expect(container.textContent).toContain("立体の図");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      localStorage.clear();
    }
  },
);
