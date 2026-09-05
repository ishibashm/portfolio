import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_LOCAL_KEYS,
  clearLocalAccountData,
  deleteAccountData,
} from "@/lib/accountData";

/**
 * 「登録した内容をすべて消す」。見張るのは 3 つ。
 *
 *   1. **端末は必ず消す。**クラウドの削除が失敗しても消す。残すと
 *      利用者には「押したのに何も消えていない」に見えるうえ、次の
 *      保存で端末の値がクラウドへ上がって元に戻る
 *   2. 消す鍵を取りこぼさない（設定・保存済みプロフィール 2 つ・
 *      初期化済みの印・目的地 3 つ）
 *   3. **消すつもりの無いものを巻き込まない**（地図に自分で置いた地点）
 */

function fakeStorage() {
  const removed: string[] = [];
  return {
    removed,
    storage: {
      removeItem(key: string) {
        removed.push(key);
      },
    },
  };
}

describe("消す鍵", () => {
  it("設定・保存済みプロフィール・目的地をすべて消す", () => {
    const { removed, storage } = fakeStorage();
    clearLocalAccountData(storage);

    expect(removed).toEqual([
      "tactical_config_v1",
      "profile_presets_v1",
      "wealth_presets",
      "presets_initialized",
      "dest_lat",
      "dest_lon",
      "dest_label",
    ]);
  });

  it("地図に自分で置いた地点は消さない", () => {
    expect(ACCOUNT_LOCAL_KEYS).not.toContain("user_spots_v1");
  });

  it("1 つ消せなくても残りを消す（プライベートモード）", () => {
    const removed: string[] = [];
    const storage = {
      removeItem(key: string) {
        if (key === "profile_presets_v1") throw new Error("QuotaExceeded");
        removed.push(key);
      },
    };

    expect(() => clearLocalAccountData(storage)).not.toThrow();
    expect(removed).toContain("dest_label");
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length - 1);
  });
});

describe("クラウドと端末の両方", () => {
  it("成功したら cloudCleared", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { removed, storage } = fakeStorage();

    const result = await deleteAccountData(
      fetcher as unknown as typeof fetch,
      storage,
    );

    expect(fetcher).toHaveBeenCalledWith("/api/user-config", {
      method: "DELETE",
    });
    expect(result).toEqual({ cloudCleared: true, unauthenticated: false });
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length);
  });

  it("未ログイン（401）でも端末は消す", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const { removed, storage } = fakeStorage();

    const result = await deleteAccountData(
      fetcher as unknown as typeof fetch,
      storage,
    );

    expect(result).toEqual({ cloudCleared: false, unauthenticated: true });
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length);
  });

  it("通信が落ちても端末は消す", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const { removed, storage } = fakeStorage();

    const result = await deleteAccountData(
      fetcher as unknown as typeof fetch,
      storage,
    );

    expect(result).toEqual({ cloudCleared: false, unauthenticated: false });
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length);
  });
});
