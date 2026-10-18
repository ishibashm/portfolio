import { expect, it } from "vitest";
import {
  dropUngroundedPlaceSuggestions,
  sanitizeFollowUpSuggestions,
} from "@/lib/followUpSuggestions";
it("文脈にない具体地名だけを除き、街や市区町村は残す", () => {
  expect(
    dropUngroundedPlaceSuggestions(
      [
        "出発地を東京都新宿区に指定する",
        "南西の街を3つ教えて",
        "名古屋市中村区の吉日を詳しく",
        "市区町村と都道府県を選ぶ",
        "名古屋駅から相談する",
        "新宿駅から相談する",
      ],
      "名古屋市中村区、名古屋駅",
    ),
  ).toEqual([
    "南西の街を3つ教えて",
    "名古屋市中村区の吉日を詳しく",
    "市区町村と都道府県を選ぶ",
    "名古屋駅から相談する",
  ]);
});
it.each([
  "北海道",
  "東京都",
  "京都府",
  "大阪府",
  "沖縄県",
  "さいたま市",
  "ニセコ町",
  "白馬村",
])("%sの裏付けを照合する", (place) => {
  const suggestions = [`${place}の候補を調べる`];
  expect(dropUngroundedPlaceSuggestions(suggestions, "")).toEqual([]);
  expect(dropUngroundedPlaceSuggestions(suggestions, place)).toEqual(
    suggestions,
  );
});
it("除去後に最小件数を満たさなければ空にする", () => {
  expect(
    sanitizeFollowUpSuggestions(
      dropUngroundedPlaceSuggestions(
        ["東京都に変更する", "南西の街を3つ教えて"],
        "名古屋市",
      ),
    ),
  ).toEqual([]);
});
