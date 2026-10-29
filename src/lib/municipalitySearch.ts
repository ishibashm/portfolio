import readings from "@/data/municipalityReadings.json";

/** 部分一致用の寛容なキー。行政コードや表示名は変更しない。 */
export function municipalitySearchKey(value: string): string {
  return (
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .normalize("NFD")
      // ローマ字のマクロン・サーカムフレックスだけを除く（仮名の濁点は残す）。
      .replace(/[\u0304\u0302]/g, "")
      .normalize("NFC")
      .replace(/[\s\-‐‑–—'’ー]/g, "")
      .replace(/shi/g, "si")
      .replace(/chi|ti/g, "ti")
      .replace(/tsu/g, "tu")
      .replace(/fu/g, "hu")
      .replace(/sha|sya/g, "sya")
      .replace(/shu|syu/g, "syu")
      .replace(/sho|syo/g, "syo")
      .replace(/cha|tya|cya/g, "tya")
      .replace(/chu|tyu|cyu/g, "tyu")
      .replace(/cho|tyo|cyo/g, "tyo")
      .replace(/jya|zya|ja/g, "zya")
      .replace(/jyu|zyu|ju/g, "zyu")
      .replace(/jyo|zyo|jo/g, "zyo")
      .replace(/ji|di/g, "zi")
      .replace(/m(?=[bp])/g, "n")
      .replace(/ou|oo/g, "o")
      .replace(/uu/g, "u")
      .replace(/ei|ee/g, "e")
      .replace(/aa/g, "a")
      .replace(/ii/g, "i")
      .replace(/([おこごそぞとどのほぼぽもよょろを])う/g, "$1")
      .replace(/([おこごそぞとどのほぼぽもよょろを])お/g, "$1")
      .replace(/([うくぐすずつづぬふぶぷむゆゅる])う/g, "$1")
      .replace(/([えけげせぜてでねへべぺめれ])(?:い|え)/g, "$1")
      .replace(/([あかがさざただなはばぱまやゃらわ])あ/g, "$1")
      .replace(/([いきぎしじちぢにひびぴみり])い/g, "$1")
  );
}

const aliases = new Map(
  readings.municipalities.map((r) => [
    r.pref + r.city,
    [r.prefKana + r.cityKana, (r.prefRoman ?? "") + (r.cityRoman ?? "")]
      .map(municipalitySearchKey)
      .filter(Boolean),
  ]),
);

export function municipalityMatches(
  area: { pref: string; city: string; full: string },
  query: string,
): boolean {
  const key = municipalitySearchKey(query);
  if (!key) return false;
  return [
    municipalitySearchKey(area.full),
    ...(aliases.get(area.pref + area.city) ?? []),
  ].some((candidate) => candidate.includes(key));
}
