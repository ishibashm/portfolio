import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlaceInput } from "@/components/relocation/PlaceInput";

/**
 * 場所の欄が**選んだ地名を呼び出し側へ渡す**こと。
 *
 * `destinationSetting` は最初から地名の置き場（dest_label）を持っていた
 * のに、渡す側が無かったので**誰も書いていなかった**。目的地は座標
 * だけが残り、/account や次に開いたときに自分が何を入れたのか読めない。
 *
 * もう 1 つ、**座標を手で直したら地名を捨てる**こと。座標だけ動いて
 * 名前が残ると、別の場所に前の地名が付いたまま画面に出る。判定は座標で
 * 決まるので、食い違っても計算は狂わないが、読む人は名前を信じる。
 */

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("/api/geocode/suggest")
          ? {
              data: [
                { name: "北海道札幌市中央区", lat: 43.0621, lon: 141.3544 },
              ],
            }
          : { data: null },
    })),
  );
});

describe("PlaceInput が渡す地名", () => {
  it("候補から選ぶと、座標と一緒に地名を渡す", async () => {
    const onChange = vi.fn();
    render(
      <PlaceInput label="目的地" lat={null} lon={null} onChange={onChange} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/例:/), {
      target: { value: "札幌" },
    });

    const option = await screen.findByRole(
      "button",
      { name: "北海道札幌市中央区" },
      { timeout: 3000 },
    );
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(
      43.0621,
      141.3544,
      "北海道札幌市中央区",
    );
  });

  it("緯度経度を手で直したときは地名を渡さない（前の名前を残さない）", async () => {
    const onChange = vi.fn();
    render(
      <PlaceInput
        label="目的地"
        lat={35.68}
        lon={139.76}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText(/緯度経度を直接入れる/));
    fireEvent.change(screen.getByPlaceholderText("緯度"), {
      target: { value: "34.7" },
    });

    expect(onChange).toHaveBeenCalledWith(34.7, 139.76);
    /* 3 つ目が undefined であること。ここが名前を持っていると、
       呼び出し側は「地名で選ばれた」と受け取ってしまう */
    expect(onChange.mock.calls[0][2]).toBeUndefined();
  });

  it("地名で選んだあと座標を手で直すと、画面の地名も消える", async () => {
    const onChange = vi.fn();
    render(
      <PlaceInput
        label="目的地"
        lat={35.68}
        lon={139.76}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/例:/), {
      target: { value: "札幌" },
    });
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "北海道札幌市中央区" },
        { timeout: 3000 },
      ),
    );
    expect(screen.getByText("北海道札幌市中央区")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/緯度経度を直接入れる/));
    fireEvent.change(screen.getByPlaceholderText("経度"), {
      target: { value: "140.1" },
    });

    await waitFor(() =>
      expect(screen.queryByText("北海道札幌市中央区")).toBeNull(),
    );
  });
});
