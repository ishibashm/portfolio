import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AdConsentBar } from "@/components/ads/AdConsentBar";
import { AD_CONSENT_STORAGE_KEY } from "@/lib/adConsent";

describe("広告の同意バー", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("未選択では説明と二つの選択を出す", () => {
    render(<AdConsentBar />);
    expect(
      screen.getByRole("link", { name: "プライバシーポリシー" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("button", { name: "必須のみ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "同意する" }),
    ).toBeInTheDocument();
  });

  it("同意すると閉じ、次の読み込みまでパーソナライズを許す印を残す", () => {
    render(<AdConsentBar />);
    fireEvent.click(screen.getByRole("button", { name: "同意する" }));
    expect(screen.queryByRole("button", { name: "同意する" })).toBeNull();
    expect(localStorage.getItem(AD_CONSENT_STORAGE_KEY)).toBe("granted");
  });

  it("必須のみを選ぶと非パーソナライズのまま閉じる", () => {
    render(<AdConsentBar />);
    fireEvent.click(screen.getByRole("button", { name: "必須のみ" }));
    expect(localStorage.getItem(AD_CONSENT_STORAGE_KEY)).toBe("denied");
    expect(screen.queryByRole("button", { name: "必須のみ" })).toBeNull();
  });
});
