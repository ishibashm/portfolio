import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * 未ログインの端末に、ログインの入口が出る。
 *
 * ## なぜ検査するか（2026-09-05、利用者の報告）
 *
 * 「ログインどこからするか、消えちゃった？」
 *
 * サイドバーは `email` が `undefined` のあいだを**確認中**として扱い、
 * ログインもログアウトも出さなかった。
 *
 *     {email === undefined ? null : email ? <ログアウト/> : <ログイン/>}
 *
 * ところが状態を調べる効果には、速度のための早期 return がある。
 *
 *     if (!hasAuthCookie()) return;   // supabase の 60KB を読まない
 *
 * 認証 cookie が無い端末＝**一度もログインしていない端末**では、ここで
 * 返って `email` は `undefined` のまま。「確認中」が永久に続き、
 * **ログインの入口が出なかった。**未ログインの人にだけ出ない、という
 * 形になっていた。**速くするために、必要な人から入口を消していた。**
 *
 * cookie が無いのは「確認できない」ではなく**「未ログインだと確認
 * できた」**。なので email の確認を待たず、cookie の有無で先に決める。
 *
 * 効果の中で `setEmail(null)` を呼ぶ手もあったが、それは
 * `react-hooks/set-state-in-effect` を 1 件増やす（CLAUDE.md 4 節：
 * 新しく書くコードで増やさない。実際に 25 → 26 になった）。cookie は
 * 購読するものが無いので `useSyncExternalStore` で読む。
 *
 * 速度のための早期 return は**そのまま残る**。
 *
 * ## この検査の限界
 *
 * 描画そのものではなく**字面**を見る。原因になった条件式
 * （`email` だけで入口を隠す）が戻っていないことを固定する。
 */
const sidebar = readFileSync(
  join(__dirname, "../src/components/GlobalSidebar.tsx"),
  "utf8",
);

/** 入口を隠す条件（原因そのもの）。email だけで決めていた。 */
const HID_BY_EMAIL_ALONE = /\{email === undefined \? null :/;

describe("未ログインでもログインの入口が出る", () => {
  it("cookie の有無を見てから隠す（email だけで隠さない）", () => {
    expect(HID_BY_EMAIL_ALONE.test(sidebar)).toBe(false);
    expect(sidebar).toContain("maybeLoggedIn && email === undefined");
  });

  it("cookie の有無は effect の setState ではなく購読で読む", () => {
    expect(sidebar).toContain("useSyncExternalStore(");
    expect(sidebar).toContain("subscribeAuthCookie");
    /* 呼び出しだけを禁じる。**素の toContain だと註まで拾う**
       （なぜ呼ばないかを本文に書いてあるため）。 */
    expect(/setEmail\(null\)\s*;/.test(sidebar)).toBe(false);
  });

  it("速度のための早期 return は残っている", () => {
    /* 未ログイン端末で supabase を読まない最適化は消さない。消すと
       sidebarNoPrefetch の検査も落ちる。直したのは「読まない」ことでは
       なく「読まないときに入口まで消していた」ほう。 */
    expect(sidebar).toMatch(/if \(!hasAuthCookie\(\)\) return;/);
  });

  it("ログインの入口そのものが残っている", () => {
    expect(sidebar).toContain("href={`/login?next=");
    expect(sidebar).toContain("ログイン");
  });

  it("この検査が働いている（直す前の書き方を拾う）", () => {
    const before = "          {email === undefined ? null : email ? (";
    expect(HID_BY_EMAIL_ALONE.test(before)).toBe(true);
  });
});
