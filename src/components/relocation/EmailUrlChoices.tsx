"use client";
import type { EmailListing } from "@/lib/listingDetails";

/*
  取り込んだ物件を、1 件 1 枚の札で並べる（利用者の指摘、2026-09-27
  「整形して見やすくしてほしい」）。

  以前は項目ごとに「賃料（円）: 68000」を 1 行ずつ積み、その下に
  長い URL（計測用の転送 URL だと 2 行に折り返す）を丸ごと出していた。
  20 件並ぶと、どこからどこまでが 1 件なのか見分けられなかった。

  - 物件名を見出しにし、賃料・間取り・駅・所在地を 3〜4 行にまとめる
  - URL は出さず、どのサイトの物件かだけ書く（転送 URL の中身は読めない）
  - ボタンの名前は「<URL> を既存入力へ」のまま。読み上げでは URL で
    どの物件か区別でき、見た目は「既存入力へ」だけになる
*/

const yen = (v: number) => `${v.toLocaleString("ja-JP")}円`;

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function joined(parts: (string | null | undefined | false)[], sep: string) {
  return parts.filter(Boolean).join(sep);
}

export function EmailUrlChoices({
  urls,
  onSelect,
  listings = [],
}: {
  urls: string[];
  listings?: EmailListing[];
  onSelect: (url: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {urls.map((url) => {
        const item = listings.find((l) => l.url === url);
        const money = joined(
          [
            item?.rentYen != null && yen(item.rentYen),
            item?.managementFeeYen != null &&
              `管理費・共益費 ${yen(item.managementFeeYen)}`,
          ],
          " ＋ ",
        );
        const room = joined(
          [
            item?.layout,
            item?.floorAreaM2 != null && `${item.floorAreaM2}㎡`,
            item?.buildingAgeYears != null && `築${item.buildingAgeYears}年`,
          ],
          "・",
        );
        const access = joined(
          [
            item?.nearestStation,
            item?.walkMinutes != null && `徒歩${item.walkMinutes}分`,
          ],
          " ",
        );
        const initial = joined(
          [
            item?.deposit && `敷金 ${item.deposit}`,
            item?.keyMoney && `礼金 ${item.keyMoney}`,
          ],
          "・",
        );
        return (
          <li
            key={url}
            className="rounded-lg border border-stone-200 bg-white p-3"
          >
            <p className="font-bold text-stone-900">
              {item?.propertyName || "名称なし"}
            </p>
            {(money || room) && (
              <p className="text-stone-800">{joined([money, room], " ／ ")}</p>
            )}
            {access && <p className="text-stone-700">{access}</p>}
            {item?.address && <p className="text-stone-700">{item.address}</p>}
            {initial && <p className="text-stone-600">{initial}</p>}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-stone-500">{siteName(url)} の物件</span>
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-bold text-stone-800 hover:bg-stone-50"
                onClick={() => onSelect(url)}
              >
                <span className="sr-only">{url} を</span>既存入力へ
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
