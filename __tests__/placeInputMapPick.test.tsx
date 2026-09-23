import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PlaceInput } from "@/components/relocation/PlaceInput";

/**
 * 場所の欄を**地図から**決められること（利用者の依頼、2026-09-22）。
 *
 * それまで座標が入る経路は「候補をクリック」「郵便番号」「住所を打って
 * 決める」「緯度経度を直接入れる」の 4 つで、**地図で指す**入口が無かった。
 * 自分の家を地名で言えない人（番地が分からない・集合住宅の棟が違う）は、
 * 緯度経度を手で入れるしかなかった。
 *
 * ## 決めごと
 *
 * - **名前は渡さない。**地図で押した点に地名は無い。前に地名で選んで
 *   いたなら、その名前は捨てる（別の場所に前の名前が付いたまま残らない
 *   ように。`lib/placePoint` と同じ決めごと）
 * - 代わりに**最寄りの市区町村を「付近」付きで出す。**座標だけだと自分が
 *   どこを押したのか読めない。これは**表示だけ**で、保存にも判定にも
 *   使わない（`describePlace` と同じ順序・同じ言い方）
 * - 地図は `import()` で遅延する。開くまで Leaflet を読み込まない
 */

/* Leaflet は jsdom で動かない。地点を返すだけの差し替えにする。
 **本物を読んでいるか**は下の「遅延して読む」が字面で見る。 */
vi.mock("@/components/LocationPickerInner", () => ({
  default: ({
    onSelect,
    onCurrentPosition,
  }: {
    initialLat: number;
    initialLon: number;
    onSelect: (lat: number, lon: number) => void;
    onCurrentPosition?: (p: {
      lat: number;
      lon: number;
      accuracyM: number;
      headingDeg: number | null;
      at: number;
    }) => void;
  }) => (
    <>
      <button type="button" onClick={() => onSelect(34.9819, 135.7444)}>
        地図の 1 点を押す
      </button>
      {/* 現在地の測位。本物は CurrentLocationControl が繰り返し呼ぶ */}
      <button
        type="button"
        onClick={() =>
          onCurrentPosition?.({
            lat: 33.5902,
            lon: 130.4017,
            accuracyM: 12,
            headingDeg: null,
            at: 0,
          })
        }
      >
        測位する
      </button>
    </>
  ),
}));

/** 京都市南区の区役所あたり。利用者の登録内容ではない。 */
const POINT = { lat: 34.9819, lon: 135.7444 };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.startsWith("/api/geocode/reverse")
          ? { data: { name: "京都府京都市南区" } }
          : url.includes("/api/geocode/suggest")
            ? { data: [{ name: "京都市南区", lat: 34.98, lon: 135.74 }] }
            : { data: null },
    })),
  );
});

describe("PlaceInput: 地図から選ぶ", () => {
  it("allowMapPick を立てないと出ない（既定では出さない）", () => {
    render(
      <PlaceInput label="出発地" lat={null} lon={null} onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/地図から選ぶ/)).toBeNull();
  });

  it("押すと座標を渡す。**名前は渡さない**", async () => {
    const onChange = vi.fn();
    render(
      <PlaceInput
        label="出発地"
        lat={null}
        lon={null}
        onChange={onChange}
        allowMapPick
      />,
    );

    fireEvent.click(screen.getByText(/地図から選ぶ/));
    fireEvent.click(await screen.findByText("地図の 1 点を押す"));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(POINT.lat, POINT.lon);
    /* 3 つ目が undefined であること。名前を渡すと呼び出し側が
       「地名で選ばれた」と受け取り、base_label に入ってしまう */
    expect(onChange.mock.calls[0][2]).toBeUndefined();
  });

  it("押した点の最寄りの市区町村を「付近」付きで出す", async () => {
    render(
      <PlaceInput
        label="出発地"
        lat={POINT.lat}
        lon={POINT.lon}
        onChange={vi.fn()}
        allowMapPick
      />,
    );
    fireEvent.click(screen.getByText(/地図から選ぶ/));
    fireEvent.click(await screen.findByText("地図の 1 点を押す"));

    expect(await screen.findByText("京都府京都市南区 付近")).toBeTruthy();
  });

  it("地名で選んでいたら、地図を押した時点でその名前を捨てる", async () => {
    const onChange = vi.fn();
    render(
      <PlaceInput
        label="出発地"
        lat={null}
        lon={null}
        onChange={onChange}
        allowMapPick
      />,
    );

    /* まず候補から地名で選ぶ */
    fireEvent.change(screen.getByPlaceholderText(/例:/), {
      target: { value: "京都" },
    });
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "京都市南区" },
        { timeout: 3000 },
      ),
    );
    expect(await screen.findByText("京都市南区")).toBeTruthy();

    /* 地図で別の点を押すと、前の地名は消える */
    fireEvent.click(screen.getByText(/地図から選ぶ/));
    fireEvent.click(await screen.findByText("地図の 1 点を押す"));

    await waitFor(() => expect(screen.queryByText("京都市南区")).toBeNull());
  });

  it("地図を遅延して読む（開くまで Leaflet を乗せない）", () => {
    /*
      `import()` でないと、この欄を置いている画面すべての初回読み込みに
      Leaflet が乗る（設定バー・ホーム・同行者の欄にもある）。
      差し替えを通すので、ここは字面で見るしかない。
    */
    const src = readFileSync(
      join(process.cwd(), "src/components/relocation/PlaceInput.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /dynamic\(\s*\(\) => import\("@\/components\/LocationPickerInner"\)/,
    );
    expect(src).toContain("ssr: false");
  });

  it("地図の部品を自分で書いていない（共有の 1 つを呼ぶ）", () => {
    /* CLAUDE.md 3 節「地図の部品は 1 つにする。写しは必ず食い違う」 */
    const src = readFileSync(
      join(process.cwd(), "src/components/relocation/PlaceInput.tsx"),
      "utf8",
    );
    expect(src).not.toContain("react-leaflet");
    expect(src).not.toContain("MapContainer");
  });
});

describe("/profile の 3 つの欄で地図を開ける", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/profile/ProfileForm.tsx"),
    "utf8",
  );

  it("出生地・出発地・目的地の 3 つに allowMapPick が立っている", () => {
    expect(src.match(/allowMapPick/g) ?? []).toHaveLength(3);
  });

  it("見張りが空回りしていない（PlaceInput を 3 つ置いている）", () => {
    expect(src.match(/<PlaceInput/g) ?? []).toHaveLength(3);
  });
});

/**
 * 現在地で決める（利用者の指摘、2026-09-22「使いにくい」）。
 *
 * 地図の現在地ボタンは「いまどこか」を見せるだけで、押しても座標は入らない。
 * 自動で入れないのは正しい（測位のたびに選んだ地点が上書きされる）。ただし
 * **いま居る場所を住まいにしたい**のがいちばん多い使い方なので、押して決める
 * 道を 1 つ出す。「測位しただけでは入らない」ことも同時に固定する。
 */
describe("PlaceInput: 現在地をここにする", () => {
  async function openMap() {
    const onChange = vi.fn();
    render(
      <PlaceInput
        label="いま住んでいるところ"
        lat={null}
        lon={null}
        onChange={onChange}
        allowMapPick
      />,
    );
    fireEvent.click(screen.getByText(/地図から選ぶ/));
    return onChange;
  }

  it("測位しただけでは座標が入らない", async () => {
    const onChange = await openMap();
    fireEvent.click(await screen.findByText("測位する"));
    /* 押すための札は出るが、値はまだ動かない */
    expect(await screen.findByText("いま居る場所をここにする")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("押すとその座標が入る。**名前は渡さない**", async () => {
    const onChange = await openMap();
    fireEvent.click(await screen.findByText("測位する"));
    fireEvent.click(await screen.findByText("いま居る場所をここにする"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeCloseTo(33.5902, 4);
    expect(onChange.mock.calls[0][1]).toBeCloseTo(130.4017, 4);
    /* 第 3 引数は「地名で選べた」印。測位した点に地名は無い */
    expect(onChange.mock.calls[0][2]).toBeUndefined();
  });

  it("測位していないあいだは札を出さない", async () => {
    await openMap();
    await screen.findByText("地図の 1 点を押す");
    expect(screen.queryByText("いま居る場所をここにする")).toBeNull();
  });
});

/**
 * 共有の地図部品（`LocationPickerInner`）の作り。
 *
 * jsdom では Leaflet を読めないので字面で見る（`mapMarkerKeyboard` と同じ作法）。
 */
describe("共有の地図部品", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/LocationPickerInner.tsx"),
    "utf8",
  );

  it("印は渡された座標そのもの（写しを state で持たない）", () => {
    /*
      以前は useState の初期値に props を写していたので、開いたあとに外から
      座標が変わっても（地名で選び直す、郵便番号を入れる）印が前の場所に
      残った。値は新しいのに地図は古い、という食い違いを利用者が見る。
    */
    expect(src).toContain("const markerPos: [number, number] | null =");
    expect(src).not.toMatch(/useState<\[number, number\] \| null>/);
    expect(src).not.toContain("setMarkerPos");
  });

  it("英語の等幅の札が戻っていない", () => {
    for (const stale of [
      "LOADING MAP ENGINE",
      "CLICK ON MAP TO SET TARGET",
      "font-mono",
    ]) {
      expect(src, `「${stale}」が残っている`).not.toContain(stale);
    }
    expect(src).toContain("地図を読み込んでいます");
  });

  it("器のサイズに追従する（折りたたみの中で開いても地色が残らない）", () => {
    expect(src).toContain("<InvalidateMapSize />");
  });

  it("選んだ点が画面の中なら地図を動かさない", () => {
    /* 端を押すたびに地図が跳ねると、隣を押して詰める操作と噛み合わない */
    expect(src).toContain("map.getBounds().contains(markerPos)");
  });
});

/**
 * ホームの「まずここを入れる」でも地図を開ける（利用者の依頼、2026-09-23）。
 *
 * /profile だけに付けていたので、ホームで同じ欄を入れる人は地図で
 * 選べなかった。同じ部品・同じ地図なので、付け忘れを字面で固定する。
 */
describe("ホームの「まずここを入れる」の 2 つの欄で地図を開ける", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/home/QuickProfileBar.tsx"),
    "utf8",
  );

  it("出発地・出生地の 2 つに allowMapPick が立っている", () => {
    expect(src.match(/allowMapPick/g) ?? []).toHaveLength(2);
  });

  it("見張りが空回りしていない（PlaceInput を 2 つ置いている）", () => {
    expect(src.match(/<PlaceInput/g) ?? []).toHaveLength(2);
  });
});
