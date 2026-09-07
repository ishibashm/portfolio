/**
 * 「登録がどこまで済んでいるか」を 1 か所で決める。
 *
 * 判定の道具が動くのに要るのは**生年月日と現在地**の 2 つ。出生地は
 * 八宅（本命卦）や出生の盤を出すときに使う。この線引きは
 * `ProfileForm` の中に `canUseTools` として書かれていたが、同じことを
 * ログイン後の行き先やマイページでも知りたいので、写さずにここへ寄せた。
 *
 * **値があるかどうかしか見ない。**判定そのもの（しきい値・方位・段階）
 * には触れていない。
 */

import {
  settingNumber,
  settingString,
  type Settings,
} from "@/lib/userSettings";

export type ProfileStepKey = "birth_date" | "birth_place" | "base";

/**
 * 場所の**表示用の地名**を置く鍵。
 *
 * 座標だけだと、次に開いたとき自分が何を入れたのか読めない（同じ理由で
 * 目的地は最初から `dest_label` を持っている）。
 *
 * **`SYNCED_FIELDS` に入れない。**クラウドへ送る個人情報を増やさない
 * ための線引きで、`saveSettings` は同期する項目だけを POST するので、
 * ここに書いた地名は端末から出ていかない。座標は今までどおり同期する
 * ので、別の端末では座標だけで出る。
 */
export const PLACE_LABEL_KEYS = {
  birth_place: "birth_label",
  base: "base_label",
} as const;

export interface ProfileStep {
  key: ProfileStepKey;
  /** 画面に出す名前。 */
  label: string;
  /** 入っているか。 */
  done: boolean;
  /** これが無いと何ができないか。埋めていない人に見せる。 */
  need: string;
  /**
   * いま入っている値。**埋まっているときだけ**入る。
   *
   * 「登録した内容を見る」頁（/account）が ✓ と ○ しか出しておらず、
   * 何を登録したのかは /profile の入力欄を開くまで分からなかった
   * （利用者の指摘、2026-09-07）。done と同じ場所で作る。別に組むと、
   * 「✓ なのに値が空」のような食い違いが起こりうる。
   */
  value?: string;
  /** 判定の道具が動くのに必須か（出生地は任意）。 */
  required: boolean;
}

function hasPoint(settings: Settings, latKey: string, lonKey: string): boolean {
  return (
    settingNumber(settings, latKey) !== undefined &&
    settingNumber(settings, lonKey) !== undefined
  );
}

/**
 * 座標を人が読める 1 行にする。
 *
 * 小数 3 桁で切る。緯度の 0.001 度はおよそ 111m で、方位が隣に変わる
 * 横ずれ（`lib/directionDistance` の実測で 5km の移動でも 1.3km）より
 * ずっと細かい。**判定にはこの文字列を使わない。**判定は保存してある
 * 数値そのもので動く。
 *
 * 同じ書式が PlaceInput と PersonalProfileConfig に写されていたので、
 * ここを寄せ先にする。
 */
export function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? "北緯" : "南緯";
  const ew = lon >= 0 ? "東経" : "西経";
  return `${ns} ${Math.abs(lat).toFixed(3)} / ${ew} ${Math.abs(lon).toFixed(3)}`;
}

/**
 * 座標が両方そろっているときだけ、その表示を返す。
 *
 * 地名を覚えていれば「地名（座標）」にする。**座標は省かない。**
 * 判定に使われるのは座標のほうで、地名は表示用でしかないので、
 * 取り違えたまま気付けないのが困る（目的地と同じ扱い）。
 *
 * 地名は**端末にだけ**残る（`SYNCED_FIELDS` に入れていないので、
 * `saveSettings` の同期には乗らない）。別の端末では座標だけになる。
 */
function pointValue(
  settings: Settings,
  latKey: string,
  lonKey: string,
  labelKey: string,
): string | undefined {
  const lat = settingNumber(settings, latKey);
  const lon = settingNumber(settings, lonKey);
  if (lat === undefined || lon === undefined) return undefined;
  const coords = formatCoords(lat, lon);
  const label = settingString(settings, labelKey);
  return label ? `${label}（${coords}）` : coords;
}

export function profileSteps(settings: Settings): ProfileStep[] {
  const birthDate = settingString(settings, "birth_date");
  return [
    {
      key: "birth_date",
      label: "生年月日",
      done: Boolean(birthDate),
      value: birthDate || undefined,
      need: "本命星が決まりません。方位の吉凶はすべてここから出ます。",
      required: true,
    },
    {
      key: "base",
      label: "いま住んでいる場所",
      done: hasPoint(settings, "base_lat", "base_lon"),
      value: pointValue(settings, "base_lat", "base_lon", "base_label"),
      need: "どちらの方位に動くのかが決まりません。物件検索の並びにも使います。",
      required: true,
    },
    {
      key: "birth_place",
      label: "出生地",
      done: hasPoint(settings, "birth_lat", "birth_lon"),
      value: pointValue(settings, "birth_lat", "birth_lon", "birth_label"),
      need: "八宅（本命卦）と出生時の盤が出せません。無くても方位の判定は動きます。",
      required: false,
    },
  ];
}

export interface ProfileCompletion {
  steps: ProfileStep[];
  /** 埋まっている数（任意項目を含む）。 */
  done: number;
  /** 全部の数。 */
  total: number;
  /** 必須がそろっていて、判定の道具が動くか。 */
  ready: boolean;
  /** まだ埋まっていないもの。 */
  missing: ProfileStep[];
}

export function profileCompletion(settings: Settings): ProfileCompletion {
  const steps = profileSteps(settings);
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    ready: steps.every((s) => !s.required || s.done),
    missing: steps.filter((s) => !s.done),
  };
}

/** 判定の道具が動くだけの値がそろっているか。 */
export function isProfileReady(settings: Settings): boolean {
  return profileCompletion(settings).ready;
}
