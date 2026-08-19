import { describe, expect, it } from "vitest";
import {
  isProtectedRoute,
  PROTECTED_ROUTE_PREFIXES,
  resolveAuthRedirect,
} from "@/utils/supabase/routeAccess";

describe("portfolio route access", () => {
  it("keeps private application routes protected", () => {
    for (const route of PROTECTED_ROUTE_PREFIXES) {
      expect(isProtectedRoute(route)).toBe(true);
      expect(isProtectedRoute(`${route}/detail`)).toBe(true);
    }
  });

  // 中核ページは匿名で開けないと、クローラーに 307 を返して索引も
  // 広告審査も通らない。ここが閉じていないことを固定する。
  it("keeps the core pages open to anonymous visitors", () => {
    for (const route of [
      "/",
      "/houi",
      "/houi/2026/1",
      "/houi/area/23100",
      "/calendar",
      "/relocation/arbitrage",
      "/relocation/simulator",
      "/relocation/wealth",
      "/about",
      "/contact",
    ]) {
      expect(isProtectedRoute(route)).toBe(false);
    }
  });

  it("削除したページは保護対象にも残らない", () => {
    // ページごと削除したので、ここに残っていると 404 を保護しにいく無駄になる。
    for (const route of [
      "/visualizer",
      "/trends",
      "/rentals",
      "/metaphysical",
      "/x-viewer",
      "/research",
      "/extract",
      "/agent-log",
      "/ceremonial-sample",
    ]) {
      expect(isProtectedRoute(route), route).toBe(false);
    }
  });

  it("残した非中核ページは引き続きログイン必須", () => {
    expect(isProtectedRoute("/relocation/history")).toBe(true);
  });

  it("管理ページはログイン必須", () => {
    // /admin/metrics はアクセス状況。閲覧記録は匿名だが、日別の並びから
    // 「いつ誰かが触っていたか」は読めるので開けない。
    expect(isProtectedRoute("/admin")).toBe(true);
    expect(isProtectedRoute("/admin/metrics")).toBe(true);
  });

  it("削除した /dashboard は保護対象に残さない", () => {
    // 全機能ランチャーは削除した。ログイン後の行き先もトップに移した。
    expect(isProtectedRoute("/dashboard")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 未ログイン・権限不足のときの行き先
 *
 * 以前は middleware に直接書いてあり、
 *
 *   1. ログイン済みだが ADMIN_EMAIL と違う人 → /login へ送り返す
 *   2. その /login は ADMIN_EMAIL と一致する人しか外へ出さない
 *
 * の噛み合わせで、一般の利用者がログイン画面から抜けられなかった。
 * 画面からは「自分のアカウントは弾かれている」ようにしか見えず、
 * 「特定の人しかログインできないのでは」という報告につながった。
 * ------------------------------------------------------------------ */

describe("resolveAuthRedirect", () => {
  const PROTECTED = "/relocation/history";
  const PUBLIC = "/relocation/arbitrage";

  it("未ログインで保護ルートならログイン画面へ。戻り先を持たせる", () => {
    expect(
      resolveAuthRedirect({
        pathname: PROTECTED,
        isLoggedIn: false,
        isAdmin: false,
        nextTarget: `${PROTECTED}?a=1`,
      }),
    ).toEqual({ kind: "login", next: `${PROTECTED}?a=1` });
  });

  it("ログイン済みで権限が足りないときは、ログイン画面へ戻さない", () => {
    // ここが以前の詰まり。ログイン済みの人をログイン画面へ送っていた。
    const r = resolveAuthRedirect({
      pathname: PROTECTED,
      isLoggedIn: true,
      isAdmin: false,
      nextTarget: PROTECTED,
    });
    expect(r).toEqual({ kind: "home" });
    expect(r).not.toMatchObject({ kind: "login" });
  });

  it("ログイン済みなら、管理者でなくてもログイン画面から出す", () => {
    // 以前は isAdmin を条件にしていたため、一般の利用者だけが残された。
    expect(
      resolveAuthRedirect({
        pathname: "/login",
        isLoggedIn: true,
        isAdmin: false,
        nextTarget: "/login",
      }),
    ).toEqual({ kind: "home" });
  });

  it("管理者はこれまでどおりログイン画面から出る", () => {
    expect(
      resolveAuthRedirect({
        pathname: "/login",
        isLoggedIn: true,
        isAdmin: true,
        nextTarget: "/login",
      }),
    ).toEqual({ kind: "home" });
  });

  it("管理者が保護ルートに来たら素通し", () => {
    expect(
      resolveAuthRedirect({
        pathname: PROTECTED,
        isLoggedIn: true,
        isAdmin: true,
        nextTarget: PROTECTED,
      }),
    ).toBeNull();
  });

  it("中核ページは、ログインの有無・権限に関わらず素通し", () => {
    for (const isLoggedIn of [true, false]) {
      for (const isAdmin of [true, false]) {
        expect(
          resolveAuthRedirect({
            pathname: PUBLIC,
            isLoggedIn,
            isAdmin,
            nextTarget: PUBLIC,
          }),
          `${PUBLIC} logged-in=${isLoggedIn} admin=${isAdmin}`,
        ).toBeNull();
      }
    }
  });

  it("未ログインが中核ページのログイン画面以外に来ても何も起きない", () => {
    expect(
      resolveAuthRedirect({
        pathname: "/login",
        isLoggedIn: false,
        isAdmin: false,
        nextTarget: "/login",
      }),
    ).toBeNull();
  });

  it("管理画面は、ログイン済みでも管理者でなければ通さない", () => {
    expect(
      resolveAuthRedirect({
        pathname: "/admin",
        isLoggedIn: true,
        isAdmin: false,
        nextTarget: "/admin",
      }),
    ).toEqual({ kind: "home" });
  });
});
