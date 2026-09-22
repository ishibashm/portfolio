import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ProfileForm } from "@/components/profile/ProfileForm";
import { SETTINGS_KEY } from "@/lib/userSettings";

/**
 * /profile の「保存しました」が、**2 回目でも出たと分かること**
 * （利用者の指摘、2026-09-22「アンドンが 2 回目立たないときがある」）。
 *
 * ## 何が起きていたか
 *
 * 2 回続けて保存すると文言が同じになる。React は同じ文字列なら帯の DOM を
 * 作り直さないので、**既に出ている緑の帯がそのまま残るだけ**で、押した人には
 * 何も起きていないように見えた。しかも帯は保存ボタンより**下**にあり、
 * 入力欄の長い画面では押したあと画面の外だった。
 *
 * ## 直し方
 *
 * - 時刻を添える → 同じ文言でも「いま保存された」と読める
 * - 置き場をボタンの**すぐ上**にし、出したら `scrollIntoView` で送る
 *
 * ## 「作り直す」は要らなかった
 *
 * 最初は帯に通し番号の `key` を振って作り直そうとしたが、`handleSubmit` の
 * 頭で `setMessage("")` しているので**帯は元から一度消えて出直している。**
 * その検査は直す前の実装でも通った（＝空回り）ので、仕掛けごと外した。
 * 見えていなかったのは作り直しの有無ではなく、**置き場と、変化として
 * 読めるものが無いこと**だった。
 */

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

/** 保存できるところまで埋まった設定。公開されている代表点を使う。 */
function withSavableSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      birth_date: "1990-01-02T05:30",
      birth_lat: 43.0618,
      birth_lon: 141.3545,
      base_lat: 33.5902,
      base_lon: 130.4017,
    }),
  );
  /* 未ログイン（401）。端末にだけ保存する経路にする */
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
}

const saveButton = () => screen.getByRole("button", { name: /保存する/ });

describe("/profile の保存の知らせ", () => {
  it("知らせに時刻が付く（同じ文言でも「いま」が分かる）", async () => {
    withSavableSettings();
    render(<ProfileForm />);
    await waitFor(() => expect(saveButton()).toBeTruthy());

    fireEvent.click(saveButton());
    const notice = await screen.findByRole("status");
    /* ja-JP の時刻。区切りは環境で違いうるので、数字の並びだけを見る */
    await waitFor(() =>
      expect(notice.textContent ?? "").toMatch(/\d{1,2}[:：]\d{2}/),
    );
  });

  it("知らせは保存ボタンより前にある（押したあと画面の外にしない）", async () => {
    withSavableSettings();
    render(<ProfileForm />);
    await waitFor(() => expect(saveButton()).toBeTruthy());

    fireEvent.click(saveButton());
    const notice = await screen.findByRole("status");
    const button = saveButton();

    /* DOCUMENT_POSITION_FOLLOWING = 4。ボタンは知らせの「後ろ」 */
    expect(notice.compareDocumentPosition(button) & 4).toBeTruthy();
  });
});

describe("/profile の保存の知らせ（作り）", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/profile/ProfileForm.tsx"),
    "utf8",
  );

  it("知らせを出す口が 1 つ（setMessage を直に呼んで回らない）", () => {
    /*
      結果ごとに setStatus / setMessage を並べて書くと、時刻や送りを
      足すたびに 1 か所だけ抜ける。出す口を `notify` にまとめてある。

      **コメントを数えない。**この註自体に setMessage と書いてあるので、
      素の字面で数えると 1 件多く出る（CLAUDE.md の「字面で見るとコメントを
      拾う」）。ブロックと行のコメントを外してから数える。
    */
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain("function notify(next: Status, text: string)");
    /* 出す側は notify の 1 回だけ。始めに消す 1 回（setMessage("")）は残る */
    expect(code.match(/setMessage\(/g) ?? []).toHaveLength(2);
  });

  it("知らせの中身は帯 1 つに閉じている（2 か所に散らさない）", () => {
    /* 以前は帯が保存ボタンより下に 1 つあるだけだった。上へ動かした
       ついでに写しを作らないこと。`role="status"` は 1 つ。 */
    expect(src.match(/role="status"/g) ?? []).toHaveLength(1);
  });
});
