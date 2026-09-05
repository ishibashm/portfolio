import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileProgress } from "@/components/profile/ProfileProgress";
import { profileCompletion } from "@/lib/profileCompletion";

/**
 * 登録の進み具合。見張るのは 2 つ。
 *
 *   1. **空の項目にだけ**「無いと何ができないか」を添える（埋まって
 *      いるものに出しても読む理由が無い）
 *   2. 必須がそろったかどうかで締めの一文が変わる
 *
 * 数字（何つ中いくつ）は `profileCompletion` 側のテストで固定してある。
 * ここは見せ方だけを見る。
 */
describe("ProfileProgress", () => {
  it("空のときは 3 項目とも足りない理由が出る", () => {
    render(<ProfileProgress completion={profileCompletion({})} />);

    expect(screen.getByText(/3 つのうち 0 つ/)).toBeInTheDocument();
    expect(screen.getByText(/本命星が決まりません/)).toBeInTheDocument();
    expect(screen.getByText(/どちらの方位に動くのか/)).toBeInTheDocument();
    expect(screen.getByText(/八宅（本命卦）/)).toBeInTheDocument();
    expect(
      screen.getByText(/生年月日といま住んでいる場所がそろうと/),
    ).toBeInTheDocument();
  });

  it("埋まった項目の説明は出さない", () => {
    render(
      <ProfileProgress
        completion={profileCompletion({ birth_date: "1990-01-02" })}
      />,
    );

    expect(screen.getByText(/3 つのうち 1 つ/)).toBeInTheDocument();
    expect(screen.queryByText(/本命星が決まりません/)).toBeNull();
    expect(screen.getByText(/どちらの方位に動くのか/)).toBeInTheDocument();
  });

  it("必須がそろえば締めの一文が変わる。出生地が空でも変わる", () => {
    render(
      <ProfileProgress
        completion={profileCompletion({
          birth_date: "1990-01-02",
          base_lat: 35.6,
          base_lon: 139.7,
        })}
      />,
    );

    expect(screen.getByText(/3 つのうち 2 つ/)).toBeInTheDocument();
    expect(
      screen.getByText(/方位の判定・引越しの試算・物件検索が使えます/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/生年月日といま住んでいる場所がそろうと/),
    ).toBeNull();
    /* 任意の項目は空のままでよいが、案内は残す */
    expect(screen.getByText(/八宅（本命卦）/)).toBeInTheDocument();
  });
});
