"use client";

import { PLACE_LABEL_KEYS, type ProfileStepKey } from "@/lib/profileCompletion";
import { saveSettings, writeLocalSettings } from "@/lib/userSettings";

/**
 * 場所（出発地・出生地）を保存する口を 1 つにする。
 *
 * ## なぜ要るか
 *
 * `PlaceInput` は `onChange(lat, lon, name?)` で**地名も**渡す。props の
 * 説明にはこう書いてある——「**前の地名を残さないこと。**座標だけ変わって
 * 名前が残ると、別の場所に前の地名が付いたまま画面に出る」。
 *
 * ところが第 3 引数を受け取っていたのは `/profile` のフォームだけで、
 * 街探し・設定バー・ホームの欄は**落としていた**（2026-09-21 に判明）。
 * `ActiveProfileBadge` は `base_label` を最優先で読み、地名があるときは
 * 座標からの逆引きを呼ばない。だから古い地名が残っていると、
 * **新しい座標の判定の横に前の街の名前が出続ける。**
 *
 *   /profile で「札幌市中央区」を選ぶ     base_label = 札幌市中央区
 *   街探しの欄で「福岡市」に変える        base_lat/lon だけ更新
 *   同じ画面の帯                          「札幌市中央区」のまま
 *
 * 判定は座標で決まるので**答えは合っている。**隣に出ている地名だけが
 * 別の街を指す。
 *
 * ## 決めごと
 *
 * **名前が無ければ、地名は欄ごと消す。**現在地ボタンや緯度経度の直接入力は
 * 名前を持たないので、そこでも必ず消える。残すほうが親切に見えるが、
 * 残した瞬間に上の食い違いが起きる。
 *
 * 地名は**端末にだけ置く**（`SYNCED_FIELDS` に入れていないので
 * `writeLocalSettings` は `_savedAt` を進めない）。座標はクラウドへ同期
 * する項目なので `saveSettings` を通す。
 */

/** 場所の種類。`profileCompletion` の歩みと同じ名前を使う。 */
export type PlaceKind = Extract<ProfileStepKey, "base" | "birth_place">;

/** 種類ごとの座標の欄。 */
const COORD_FIELDS: Record<PlaceKind, { lat: string; lon: string }> = {
  base: { lat: "base_lat", lon: "base_lon" },
  birth_place: { lat: "birth_lat", lon: "birth_lon" },
};

/**
 * 地名だけを端末に書く。**`name` が無ければ欄ごと消す。**
 *
 * 消すのに `null` を置かない。素の JSON を手で読む画面が
 * `!== undefined` を「値がある」と読んで落ちるため（#1423）。
 * `undefined` は `JSON.stringify` が欄ごと落とすので、跡が残らない。
 */
export function writePlaceLabel(kind: PlaceKind, name?: string): void {
  writeLocalSettings({ [PLACE_LABEL_KEYS[kind]]: name || undefined });
}

/**
 * 座標と地名を一緒に保存する。座標はクラウドへ、地名は端末だけ。
 *
 * 地名を先に書く。`saveSettings` は非同期でクラウドと突き合わせるので、
 * その待ちのあいだに画面が読み直しても、古い地名を拾わない。
 */
export function savePlacePoint(
  kind: PlaceKind,
  lat: number,
  lon: number,
  name?: string,
): ReturnType<typeof saveSettings> {
  writePlaceLabel(kind, name);
  const f = COORD_FIELDS[kind];
  return saveSettings({ [f.lat]: lat, [f.lon]: lon });
}
