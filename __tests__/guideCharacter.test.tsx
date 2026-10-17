import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GuideCharacter, {
  GuideAvatar,
  GUIDE_NAME,
} from "@/components/guide/GuideCharacter";
import NotFound from "@/app/not-found";
import { ArticleToolCta } from "@/components/blog/ArticleToolCta";
import { AgentEntry } from "@/components/home/AgentEntry";

/**
 * 初代 案内役「しるべ」（docs/guide-character.md）。
 * 画像の重さ・場所の確保・lazy・台詞の置き場所を固定する。
 */
afterEach(cleanup);

const POSES = ["pointing", "magnifier", "compass", "thumbsup"] as const;
const LIMITS = { 96: 15_000, 240: 40_000, 480: 80_000 } as const;

describe("画像", () => {
  it.each(POSES)("%s は 3 幅 × AVIF/WebP が目安の重さ以内", (pose) => {
    for (const [w, limit] of Object.entries(LIMITS)) {
      for (const ext of ["avif", "webp"]) {
        const p = join(
          process.cwd(),
          "public",
          "guide",
          `shirube-${pose}-${w}.${ext}`,
        );
        expect(existsSync(p), p).toBe(true);
        expect(statSync(p).size, p).toBeLessThanOrEqual(limit);
      }
    }
  });
});

describe("GuideCharacter", () => {
  it("名前入りの代替文・大きさ・既定 lazy・AVIF と WebP の srcset", () => {
    const { container } = render(
      <GuideCharacter pose="magnifier">こんにちは</GuideCharacter>,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toContain(GUIDE_NAME);
    expect(img.getAttribute("width")).toBe("240");
    expect(img.getAttribute("height")).toBe("321");
    expect(img.getAttribute("loading")).toBe("lazy");
    const types = [...container.querySelectorAll("source")].map((s) =>
      s.getAttribute("type"),
    );
    expect(types).toEqual(["image/avif", "image/webp"]);
    expect(container.querySelector("source")!.getAttribute("srcset")).toContain(
      "/guide/shirube-magnifier-96.avif 96w",
    );
    expect(screen.getByText("こんにちは")).toBeTruthy();
    expect(screen.getByText(GUIDE_NAME)).toBeTruthy();
  });

  it("priority=low は eager + fetchPriority low、decorative は読み上げない", () => {
    const { container } = render(
      <GuideAvatar pose="compass" priority="low" decorative />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("low");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("置き場所", () => {
  it("404 で虫めがねのしるべが行き先を案内する", () => {
    render(<NotFound />);
    expect(screen.getByText(/この方角には道がないようです/)).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("alt")).toContain("しるべ");
  });

  it("エラー画面にも案内役がいる", () => {
    const src = readFileSync("src/app/error.tsx", "utf8");
    expect(src).toContain('<GuideCharacter pose="magnifier"');
    expect(src).toContain("羅盤が少し乱れました");
  });

  it("記事末尾の導線で、本文より下なので lazy", () => {
    render(<ArticleToolCta tags={["方位"]} />);
    expect(
      screen.getByText(/あなたの生年月日で確かめてみましょう/),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /しるべ/ }).getAttribute("loading"),
    ).toBe("lazy");
  });

  it("トップの「エージェントに案内してもらう」は最初の画面なので fetchPriority low、参考情報の文言つき", () => {
    render(<AgentEntry />);
    const img = screen.getByRole("img", { name: /しるべ/ });
    expect(img.getAttribute("fetchpriority")).toBe("low");
    expect(screen.getByText(/根拠の計算もお見せします/)).toBeTruthy();
    expect(screen.getByText(/参考情報です/)).toBeTruthy();
  });

  it("記事の著者・構造化データは組織のまま（キャラクターを著者にしない）", () => {
    const src = readFileSync("src/components/JsonLd.tsx", "utf8");
    expect(src).not.toContain("しるべ");
    expect(src).toContain('author: { "@id": `${BASE}/#organization` }');
  });
});

describe("チャット用デフォルメアイコン（例外）", () => {
  it("派生画像は軽く、/ask 以外からは参照しない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const f of [
      "shirube-chibi-chat-96.avif",
      "shirube-chibi-chat-96.webp",
      "shirube-chibi-chat-240.avif",
      "shirube-chibi-chat-240.webp",
    ]) {
      expect(fs.statSync(path.join("public/guide", f)).size).toBeLessThan(
        15_000,
      );
    }
    const walk = (d: string): string[] =>
      fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
        );
    const users = walk("src").filter(
      (f) =>
        /\.(tsx?|jsx?)$/.test(f) &&
        fs.readFileSync(f, "utf8").includes("GuideChatAvatar"),
    );
    expect(users.sort()).toEqual(
      [
        "src/app/ask/AskWorkspacePanels.tsx",
        "src/app/ask/McpExplorer.tsx",
        "src/components/guide/GuideCharacter.tsx",
      ].map((p) => path.normalize(p)),
    );
    const reserveRefs = walk("src").filter((f) =>
      fs.readFileSync(f, "utf8").includes("shirube-chibi-pointing-reserve"),
    );
    expect(reserveRefs).toEqual([]);
  });
});
