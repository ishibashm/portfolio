import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SavedAnalysisPanel } from "@/components/relocation/SavedAnalysisPanel";
import { MCP_URL, readSavedAnalyses } from "@/lib/timingReport";

/**
 * 分析を「この端末に保存」「AI に渡す用にコピー」できること
 * （利用者の依頼、2026-09-26）。
 */

const MD = "# 引越し時期の全期間分析（Cloud Palette）\n\n| 南東 | S 三盤吉 |";

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
});
afterEach(() => vi.unstubAllGlobals());

describe("SavedAnalysisPanel", () => {
  it("走査前（文書が作れない）ならボタンは押せない", () => {
    render(
      <SavedAnalysisPanel
        kind="timing"
        defaultName="x"
        buildMarkdown={() => null}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "この端末に保存",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("走査したあとに使えます。")).toBeTruthy();
  });

  it("保存すると端末の一覧に入り、画面にも並ぶ", async () => {
    render(
      <SavedAnalysisPanel
        kind="timing"
        defaultName="2026-09-26 の時期分析"
        buildMarkdown={() => MD}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "この端末に保存" }));
    await screen.findByText("2026-09-26 の時期分析");
    const saved = readSavedAnalyses(localStorage);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: "timing", markdown: MD });
    expect(screen.getByRole("status").textContent).toMatch(/すべて消す/);
  });

  it("AI に渡す用にコピーすると、文書そのものがクリップボードに入る", async () => {
    render(
      <SavedAnalysisPanel
        kind="timing"
        defaultName="x"
        buildMarkdown={() => MD}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "AI に渡す用にコピー" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MD));
  });

  it("MCP の URL を出し、こちらから AI へは送らないと断る", () => {
    render(
      <SavedAnalysisPanel
        kind="timing"
        defaultName="x"
        buildMarkdown={() => MD}
      />,
    );
    expect(screen.getByText(MCP_URL)).toBeTruthy();
    expect(
      screen.getByText(/このサイトから AI へは何も送りません/),
    ).toBeTruthy();
  });

  it("他の頁の保存は並べない（kind で分ける）", async () => {
    render(
      <SavedAnalysisPanel
        kind="calendar"
        defaultName="cal"
        buildMarkdown={() => MD}
      />,
    );
    localStorage.setItem(
      "saved_analyses_v1",
      JSON.stringify([
        {
          id: "a",
          kind: "timing",
          name: "時期のほう",
          savedAt: "2026-09-26T00:00:00Z",
          markdown: MD,
        },
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "この端末に保存" }));
    await screen.findByText("cal");
    expect(screen.queryByText("時期のほう")).toBeNull();
  });
});

describe("時期の頁に置いてある", () => {
  it("/relocation/timing が lib/timingReport の文書でパネルを出す", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/relocation/timing/page.tsx"),
      "utf8",
    );
    expect(src).toContain("<SavedAnalysisPanel");
    expect(src).toContain('kind="timing"');
    expect(src).toContain("buildTimingReport(");
  });
});
