import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "@/components/profile/ProfileForm";
import { QuickProfileBar } from "@/components/home/QuickProfileBar";
import { SETTINGS_KEY } from "@/lib/userSettings";

/**
 * /profile の生年月日欄に、**保存されている値がそのまま出るか。**
 *
 * ホームの入力欄（`QuickProfileBar`）と物件検索の同行者欄は
 * `datetime-local` なので、設定には "1990-01-02T05:30" のような
 * **時刻つき**の文字列が入る。/profile の欄は `type="date"` で、
 * ブラウザは形の合わない値を**空欄として描く**。
 *
 * その結果、登録済みなのに未入力に見え、`required` なので保存も通らず、
 * すぐ上の「登録の進み具合」は同じ値を「1990-01-02T05:30」と出す、
 * という食い違いが同じ画面に出ていた。
 *
 * 日付だけを欄に渡し、**時刻は保存されている値のまま持ち回る**。
 * ここで時刻を落とすと時柱が変わる（判定が動く）。
 */

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function withStoredBirth(value: string) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ birth_date: value }));
  /* 未ログイン（401）。端末の値だけを読む経路にする */
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
}

const birthInput = () => screen.getByLabelText(/生年月日/) as HTMLInputElement;

describe("/profile の生年月日欄", () => {
  it("時刻つきで保存されていても、日付が欄に出る", async () => {
    withStoredBirth("1990-01-02T05:30");
    render(<ProfileForm />);

    await waitFor(() => expect(birthInput().value).toBe("1990-01-02"));
  });

  it("日付を直しても、保存されている時刻を落とさない", async () => {
    withStoredBirth("1990-01-02T05:30");
    render(<ProfileForm />);
    await waitFor(() => expect(birthInput().value).toBe("1990-01-02"));

    fireEvent.change(birthInput(), { target: { value: "1990-01-03" } });

    /* 欄には日付だけが出るが、持っている値は時刻つきのまま。
       「登録の進み具合」がその値を出すので、そこで確かめる */
    await waitFor(() =>
      expect(screen.getByText("1990-01-03T05:30")).toBeInTheDocument(),
    );
  });

  it("日付だけで保存されている人は今までどおり", async () => {
    withStoredBirth("1990-01-02");
    render(<ProfileForm />);

    await waitFor(() => expect(birthInput().value).toBe("1990-01-02"));
    expect(screen.getByText("1990-01-02")).toBeInTheDocument();
  });
});

/**
 * 逆向きも同じ。ホームの欄は `datetime-local` なので、/profile で入れた
 * 日付だけの値（"1990-01-02"）を渡すと**空欄として描かれる**。
 *
 * 欄に出すときだけ正午を補う（物件検索の同行者欄と同じ扱い）。
 * **持っている値は書き換えない**ので、触らずに保存しても日付だけのまま
 * 残る。勝手に正午へ寄せると時柱が変わる。
 */
describe("ホームの生年月日欄", () => {
  it("日付だけで保存されていても空欄にならない", async () => {
    withStoredBirth("1990-01-02");
    render(<QuickProfileBar />);

    const input = (await screen.findByLabelText(
      /生年月日/,
    )) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("1990-01-02T12:00"));
  });

  it("時刻つきで保存されていればそのまま出る", async () => {
    withStoredBirth("1990-01-02T05:30");
    render(<QuickProfileBar />);

    const input = (await screen.findByLabelText(
      /生年月日/,
    )) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("1990-01-02T05:30"));
  });
});
