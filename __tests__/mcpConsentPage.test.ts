import { describe, expect, it } from "vitest";
import {
  fireEvent,
  getAllByRole,
  getByRole,
  getByText,
} from "@testing-library/dom";
import {
  MCP_CONSENT_HEADERS,
  renderMcpConsentPage,
} from "@/lib/mcpConsentPage";
import type { McpConsentView } from "@/lib/mcpConsent";

const view: McpConsentView = {
  uid: "i".repeat(32),
  userId: "11111111-1111-4111-8111-111111111111",
  clientId: "client-test",
  clientName: "Test AI",
  redirectUri: "https://client.invalid/callback",
  interactionExpiresAt: Date.now() + 60_000,
  binding: "not-rendered",
  profiles: [
    { id: "one", name: "同名" },
    { id: "two", name: "同名" },
  ],
};
function render(value = view) {
  document.body.innerHTML = renderMcpConsentPage(value, "test-csrf-ticket");
  return document.body;
}
describe("MCP consent document", () => {
  it("shows the destination, permission and consequences before submission", () => {
    const page = render();
    expect(getByRole(page, "heading", { level: 1 })).toHaveTextContent(
      "AIへの読み取り許可",
    );
    expect(getByText(page, "Test AI")).toBeVisible();
    for (const text of [
      "read:profiles",
      "生年月日",
      "座標",
      "最大30日",
      "自動で共有されません",
      "通常のログアウト",
      "回収できません",
      "端末内だけ",
    ])
      expect(page).toHaveTextContent(text);
    expect(page).not.toHaveTextContent(view.userId);
    expect(page).not.toHaveTextContent(view.binding);
  });
  it("keeps choices empty and distinguishes identical names by ID with associated labels", () => {
    const page = render();
    const boxes = getAllByRole(page, "checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([false, false]);
    expect(getByRole(page, "checkbox", { name: "同名 （ID: one）" })).toBe(
      boxes[0],
    );
    expect(getByRole(page, "checkbox", { name: "同名 （ID: two）" })).toBe(
      boxes[1],
    );
    boxes[1].focus();
    expect(document.activeElement).toBe(boxes[1]);
    fireEvent.click(boxes[1]);
    const form = page.querySelector("form")!;
    expect(new FormData(form).getAll("profileIds")).toEqual(["two"]);
    expect(new FormData(form).get("ticket")).toBe("test-csrf-ticket");
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe(`/oauth/interaction/${view.uid}`);
    expect(getByRole(page, "button", { name: "許可しない" })).toHaveAttribute(
      "value",
      "deny",
    );
  });
  it("escapes names, IDs, client metadata and attributes without active content", () => {
    const attack =
      '\"><img src="https://evil.invalid" onerror="alert(1)"><script>alert(1)</script>&';
    const page = render({
      ...view,
      clientName: attack,
      clientId: attack,
      redirectUri: attack,
      profiles: [{ id: attack, name: attack }],
    });
    expect(page.querySelectorAll("img,script,iframe,a")).toHaveLength(0);
    expect(getByRole(page, "checkbox")).toHaveAttribute("value", attack);
    expect(page.textContent).toContain(attack);
    expect(page.innerHTML).not.toContain("userId");
  });
  it("explains empty cloud state without asserting that local data exists", () => {
    const page = render({ ...view, profiles: [] });
    expect(page).toHaveTextContent("元の端末でログインとクラウド保存を確認");
    expect(
      getByRole(page, "button", { name: "選択したプロフィールを許可する" }),
    ).toBeDisabled();
    expect(getByRole(page, "button", { name: "許可しない" })).toBeEnabled();
  });
  it("prohibits framing, external requests, caching and referrer leakage", () => {
    expect(MCP_CONSENT_HEADERS).toMatchObject({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
  });
});
