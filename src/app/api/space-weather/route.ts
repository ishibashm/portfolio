import { NextResponse } from "next/server";
import { fetchSpaceWeather } from "@/utils/spaceWeather";

/**
 * 宇宙天気（Kp 指数・X 線フラックス・太陽風速度）を返す。
 *
 * 中身は `utils/spaceWeather` がそのまま NOAA から取ってくる。ここが要るのは
 * **キャッシュを効かせるため**。
 *
 * それまではホーム（SolarTimeClock）が `fetchSpaceWeather()` を直接呼んで
 * いた。あの関数の中の fetch には `{ next: { revalidate: 300 } }` が付いて
 * いるが、**この指定はサーバの fetch でしか効かない**。ブラウザでは黙って
 * 無視されるので、
 *
 *   - 利用者が 1 人ページを開くたびに NOAA へ 3 本のリクエストが飛ぶ
 *   - キャッシュが無いので、開くたびに毎回待つ
 *   - NOAA が遅い日はそのまま画面上部の環境テレメトリが待たされる
 *
 * という状態だった。サーバ側で取れば revalidate が効き、5 分に 1 回の取得を
 * 全員で共有できる。ブラウザから見た接続先も自サイト 1 本になる。
 */
export const revalidate = 300;

export async function GET() {
  const data = await fetchSpaceWeather();
  return NextResponse.json(data);
}
