/**
 * 画面の色の決め事。
 *
 * ## なぜ要るか
 *
 * ホームの各タブが、それぞれ 6〜9 色の色相を独立に使っていた（実測）。
 *
 *   環境データ     amber blue emerald orange purple red rose yellow   8
 *   総合スコア     amber blue emerald indigo orange red yellow        7
 *   目的地/健康    上記 + purple rose                                 9
 *   ホーム         amber emerald indigo purple red sky                6
 *
 * 共通の体系が無いので、1 画面ずつ塗り直してもまた散る。**先に「どの色は
 * 何のためのものか」を決めて、それ以外を使わない。**
 *
 * ## いちばん効く規則：判定の色を他所で使わない
 *
 * このサイトは**緑＝吉・赤＝凶**を判定の意味に使っている
 * （utils/tierDisplay の TIER_FILL）。ところが実際には、判定と何の関係も
 * ない札や見出しにも緑や赤が使われていた。読み手には見分けがつかない。
 *
 * **緑と赤は判定に予約する。**装飾で使わない。これだけで、画面を見た
 * ときに「色が付いている＝意味がある」が成り立つ。
 *
 * ## 役割は 4 つだけ
 *
 *   判定      TIER_FILL（このファイルでは持たない。予約されていることだけ書く）
 *   構造      枠・地・見出し。stone だけ。色相を持たない
 *   操作      押せるもの・選択中・リンク。indigo だけ
 *   注意      警告・未確定・注記。amber だけ
 *
 * 節どうしの区別は**色ではなく見出しと余白**で行う。札ごとに色を変えない。
 *
 * ## 連続量は 1 本のランプで
 *
 * 価格・利回り・気温のような「大小のある量」は、色相を変えずに**明度だけ**
 * 動かす。虹色にしない。緑〜赤にもしない（判定と衝突するうえ、赤緑色覚では
 * 両端が潰れる）。
 */

/** 判定に予約されている色相。装飾で使わない。 */
export const RESERVED_JUDGEMENT_HUES = [
  "emerald",
  "green",
  "red",
  "rose",
] as const;

/** 操作（押せるもの・選択中・リンク）に使う唯一の色相。 */
export const ACCENT_HUE = "indigo";

/** 注意（警告・未確定・注記）に使う唯一の色相。 */
export const WARN_HUE = "amber";

/** 構造（枠・地・見出し）に使う色相。色を持たない。 */
export const NEUTRAL_HUE = "stone";

/**
 * 連続量のランプ。**明度が単調に下がる 1 色相。**
 *
 * blue を選んだのは、緑（吉）・赤（凶）と離れていて、赤緑色覚でも
 * 明度差がそのまま残るため。操作の indigo とは隣り合うが、ランプは
 * 「並びとして」読まれるので、操作の 1 色と混同されない。
 *
 * 値は Tailwind の blue-50 / 200 / 400 / 600 / 900。
 */
export const SEQUENTIAL_RAMP = [
  "#eff6ff",
  "#bfdbfe",
  "#60a5fa",
  "#2563eb",
  "#1e3a8a",
] as const;

/**
 * 相対輝度（WCAG の定義）。ランプが単調に暗くなることを検査するために使う。
 *
 * 目で見て「だんだん濃い」と判断しない。**段を足したり差し替えたりした
 * ときに、順序が崩れたことへ気付けるようにする**のが目的。
 */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`色は #rrggbb で書くこと: ${hex}`);
  const n = parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * 連続量のランプから、0〜1 の値に対応する色を選ぶ。
 *
 * 範囲の外は端に丸める。NaN は**いちばん薄い段**へ倒す。濃い側へ倒すと
 * 「値が無い」が「値が大きい」に見える。
 */
export function rampColor(ratio: number): string {
  if (!Number.isFinite(ratio)) return SEQUENTIAL_RAMP[0];
  const clamped = Math.min(1, Math.max(0, ratio));
  const index = Math.min(
    SEQUENTIAL_RAMP.length - 1,
    Math.floor(clamped * SEQUENTIAL_RAMP.length),
  );
  return SEQUENTIAL_RAMP[index];
}

/**
 * 明るい地に文字として置くと読めない Tailwind の段。
 *
 * 実測（白地に対するコントラスト比。本文には 4.5:1 が要る）。
 *
 *   yellow-400  1.53:1   ← 実際に凡例で使われていて読めなかった
 *   emerald-400 1.92:1
 *   orange-400  2.26:1
 *   amber-500   2.15:1
 *
 * **ここに挙げた段を text- で使わない。**地色（bg-）としてなら薄い段は
 * 正しい使い方なので、禁じるのは文字だけ。
 *
 * 目で見て「読めるか」を判断しない。明るい黄色や明るい緑は、作っている
 * 側の画面では見えていることがある（表示の設定や周囲の明るさで変わる）。
 * **数字で決める。**
 */
export const UNREADABLE_TEXT_STEPS = [
  "yellow-200",
  "yellow-300",
  "yellow-400",
  "yellow-500",
  "amber-200",
  "amber-300",
  "amber-400",
  "amber-500",
  "lime-300",
  "lime-400",
  "lime-500",
  "orange-300",
  "orange-400",
  "orange-500",
  "emerald-300",
  "emerald-400",
  "emerald-500",
  "sky-300",
  "sky-400",
] as const;

/**
 * 2 つの体系のどちらから来た数字かを表す色。
 *
 * ConsultPanel（環境データ）は、暦・気学の側と天文・物理の側を色で
 * 分けていた。**装飾ではなく分類**なので残す。ただし判定（緑・赤）とも
 * 操作（indigo）とも重ならない色相であること。
 *
 * 節の見出しで済むところに色を足さないこと。ここは同じ画面の中で
 * 2 系統が何度も交互に出てくるので、色が要る数少ない場所。
 */
export const SYSTEM_HUES = {
  /** 暦・気学（本命星・月盤・天中殺） */
  calendar: "purple",
  /** 天文・物理（黄経・月相・地磁気） */
  physical: "blue",
} as const;
