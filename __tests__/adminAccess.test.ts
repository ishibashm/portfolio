import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAdminEmail } from "@/utils/supabase/routeAccess";

/**
 * 管理者の判定。middleware（ページ）と denyUnlessAdmin（API）が
 * 両方ここを見る。
 *
 * 守るのは 1 点だけ。**ADMIN_EMAIL が未設定のときに開かないこと。**
 * 以前は「未設定なら、ログインしていれば通す」だったので、環境変数の
 * 入れ忘れ・消失・打ち間違いが、エラーにならないまま「ログインした人
 * 全員が管理画面を読める」状態になっていた。
 *
 * 環境変数は vi.stubEnv で差す。NODE_ENV は型が読み取り専用で、
 * process.env への直接代入も defineProperty も通らない。
 */

describe("isAdminEmail", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ADMIN_EMAIL と一致すれば管理者", () => {
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    expect(isAdminEmail("owner@example.com")).toBe(true);
  });

  it("大文字小文字は問わない。どちらの側も揃えて比べる", () => {
    vi.stubEnv("ADMIN_EMAIL", "Owner@Example.com");
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("OWNER@EXAMPLE.COM")).toBe(true);
  });

  it("別のアドレスは管理者ではない", () => {
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    expect(isAdminEmail("stranger@example.com")).toBe(false);
  });

  it("メールが無ければ管理者ではない", () => {
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  // ここが本題。旧実装は未設定を「全員が管理者」と読んでいた。
  // この 2 件を消すと、その挙動に戻しても気付けなくなる。
  it("本番で ADMIN_EMAIL が未設定なら、誰も管理者ではない", () => {
    expect(isAdminEmail("anyone@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it("開発では未設定でも通す。.env を置かずに動かせるようにする", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAdminEmail("anyone@example.com")).toBe(true);
  });
});
