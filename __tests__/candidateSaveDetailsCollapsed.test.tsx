import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CandidateSave } from "@/components/relocation/CandidateSave";
import type { ListingDetails } from "@/lib/listingDetails";

/**
 * 候補の保存（CandidateSave）の物件情報の欄は畳んでおく。
 *
 * 住所や地図から来た人には空欄が 11 個並ぶだけで、「候補に保存」の
 * ボタンが画面の下へ押し出されていた（実機 390px で 1 画面ぶん）。
 * メールから取り込んだとき（値が入っている）だけ開く。
 */

const context = {
  birthDate: "1990-01-10",
  targetDate: "2026-11-08",
  baseLat: "35.0116",
  baseLon: "135.7681",
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;

function renderSave(details: ListingDetails) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ count: 0 })),
  );
  return render(
    <CandidateSave
      target={{ lat: 35.1815, lon: 136.9066, name: "x", inputSource: "pin" }}
      context={context}
      url=""
      memo=""
      ready
      title=""
      onTitleChange={() => {}}
      details={details}
      onDetailsChange={() => {}}
    />,
  );
}

describe("候補の保存: 物件情報の欄", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("値が無ければ畳んである（欄は残り、開ける）", () => {
    const { container } = renderSave({});
    const d = container.querySelector("details");
    expect(d).not.toBeNull();
    expect(d!.open).toBe(false);
    expect(screen.getByText(/物件情報（任意/)).toBeTruthy();
    expect(screen.getByLabelText("賃料（円）")).toBeTruthy();
  });

  it("メールから値が入っていれば開いている", () => {
    const { container } = renderSave({ rentYen: 118000 });
    expect(container.querySelector("details")!.open).toBe(true);
  });
});
