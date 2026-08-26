/**
 * 天・地・人の総合評価の、帯と文言。**ここが唯一の決め所。**
 *
 * ## なぜ抜き出したか
 *
 * 帯（良好/注意/危険のバッジ）と助言（下の文章）が、別々のしきい値で
 * 動いていた。
 *
 *   帯    総合 70 超なら良好
 *   助言  凶殺が無く、天・人が 50 以上なら緑
 *
 * 天 84・地 60・人 80 だと総合は 70（= 70 超ではない）で帯は **注意**、
 * なのに助言は条件を満たすので**緑の「安心してそのまま計画を実行して
 * ください」**。同じ画面で注意と安心が同居していた（利用者の指摘）。
 *
 * 逆向きの食い違いもあった。地が 95 で天が 45 だと総合 75 で帯は良好、
 * 助言は「天の乱れ」で琥珀。**良い顔と悪い顔を同時に出さない。**
 *
 * ## 決め方
 *
 * 数字の帯と文章の帯が食い違うときは、**悪いほうに揃える。**
 *
 *   1. 方位の凶殺がある            → 危険
 *   2. 天か人が 50 未満            → 注意（以上）
 *   3. 総合が 70 以下              → 注意（以上）
 *   4. どれでもない                → 良好
 *
 * しきい値（70 / 40 / 50）は**元の実装の値をそのまま使っている。**
 * 変えたのは「どちらの帯を信じるか」だけ。
 *
 * ## 文言の方針
 *
 * 「地脈エネルギー」「完全整合化フェーズ」のような語は使わない。
 * 見ているのは土用・逆行・方位の凶殺・本命星の相性で、**そのまま
 * 書けば伝わる。**飾ると、外れたときに何を見て外れたのか分からなくなる。
 */

export type VerdictBand = "good" | "caution" | "danger";

export interface VerdictInput {
  /** 総合（0〜100）。計算は呼び出し側（重みには触れていない） */
  overallScore: number;
  /** 方位の凶殺（五黄殺・暗剣殺など）に当たっているか */
  hasSevereClash: boolean;
  /** 当たっている凶殺の名前。無ければ null */
  worstClashType: string | null;
  /** 天（時期）の点 */
  timeScore: number;
  /** 人（心身・相性）の点 */
  humanScore: number;
  /** 地（方位）の点 */
  spaceScore: number;
  /** 天を下げている要因（土用・逆行など） */
  timeRiskFactors: string[];
  /** 自律神経の負荷が高い状態か（呼び出し側の判定のまま） */
  highAnsLoad: boolean;
  /** いま選べる中で条件の良い代替日。無ければ null */
  bestAlternativeDate: string | null;
  /** その場で計画へ反映できる画面か（できなければ誘導文になる） */
  canApplyAction: boolean;
}

export type VerdictActionType = "DETOUR" | "NAVIGATE" | "DATE" | "REST";

export interface Verdict {
  band: VerdictBand;
  /** バッジに出す短い言葉。英語（EXCELLENT 等）はやめた */
  bandLabel: string;
  title: string;
  problem: string;
  solution: string;
  actionLabel: string | null;
  actionType: VerdictActionType | null;
  actionData?: string;
}

/** 3 軸のうち、いちばん低いものの名前と点。 */
function weakestAxis(input: VerdictInput): { name: string; score: number } {
  const axes = [
    { name: "地（方位）", score: input.spaceScore },
    { name: "天（時期）", score: input.timeScore },
    { name: "人（心身・相性）", score: input.humanScore },
  ];
  return axes.reduce((worst, axis) =>
    axis.score < worst.score ? axis : worst,
  );
}

const BAND_LABEL: Record<VerdictBand, string> = {
  good: "良好",
  caution: "注意",
  danger: "危険",
};

export function buildTenChiJinVerdict(input: VerdictInput): Verdict {
  // 1. 方位の凶殺。ここが最優先で、他がどれだけ良くても危険。
  if (input.hasSevereClash) {
    return {
      band: "danger",
      bandLabel: BAND_LABEL.danger,
      title: "【危険】方位の凶殺に当たっています",
      problem: `この移動の方位は${input.worstClashType || "方位凶殺"}に当たります。九星気学では、他の条件がどれだけ良くても避けるべきとされる組み合わせです。`,
      solution: input.canApplyAction
        ? "中継地（仮吉方）を挟んで方位を変えるか、出発日を変えてください。下のボタンで迂回ルートを挿入できます。"
        : "移動シミュレーターで、中継地（仮吉方）を挟む迂回ルートの設計か、日付の調整を行ってください。",
      /*
        中継地の名前をここに書かない。以前は「敦賀を経由する〜」と
        決め打ちだったが、実際に挿入される中継地は受け側（simulator）が
        候補を採点して選ぶので、敦賀とは限らない。名乗った地名と違う
        場所が挿入されるボタンになっていた。
      */
      actionLabel: input.canApplyAction
        ? "最良の中継地で迂回ルートを挿入"
        : "この移動をシミュレーターで詳細調整する",
      actionType: input.canApplyAction ? "DETOUR" : "NAVIGATE",
    };
  }

  // 2. 天か人が半分を切っている。
  if (input.timeScore < 50 || input.humanScore < 50) {
    const issues: string[] = [];
    if (input.timeRiskFactors.length > 0) {
      issues.push(`時期の障り（${input.timeRiskFactors.join("・")}）`);
    }
    if (input.highAnsLoad) {
      issues.push("自律神経の負荷の高さ");
    }
    const listed = issues.length > 0 ? issues.join("と") : "時期か体調の条件";
    return {
      band: "caution",
      bandLabel: BAND_LABEL.caution,
      title: "【注意】時期か体調に障りがあります",
      problem: `方位そのものは悪くありませんが、${listed}が全体を下げています。`,
      solution: input.bestAlternativeDate
        ? `出発日を【${input.bestAlternativeDate}】に変えると、この障りを避けられます。`
        : "急ぐ移動でなければ、出発前に休息を取って体調を整えるか、時期を少しずらすことを検討してください。",
      actionLabel: input.bestAlternativeDate
        ? `${input.bestAlternativeDate} に出発日を変更`
        : "生体回復アドバイスを表示",
      actionType: input.bestAlternativeDate ? "DATE" : "REST",
      actionData: input.bestAlternativeDate ?? undefined,
    };
  }

  // 3. 個々に大きな欠点は無いが、総合はまだ注意の帯（≦70）。
  //    以前はここで緑の「安心して実行してください」が出ていた。
  if (input.overallScore <= 70) {
    const weakest = weakestAxis(input);
    return {
      band: "caution",
      bandLabel: BAND_LABEL.caution,
      title: "【注意】良くも悪くもない組み合わせです",
      problem: `大きな障りはありませんが、${weakest.name}が ${weakest.score}% にとどまり、総合を下げています。`,
      solution: input.bestAlternativeDate
        ? `急ぐ移動ならこのままでも構いません。選べるなら、出発日を【${input.bestAlternativeDate}】に変えると総合が上がります。`
        : "急ぐ移動ならこのままでも構いません。選べるなら、時期か経路を変えて総合が 70 を超える組み合わせを探してください。",
      actionLabel: input.bestAlternativeDate
        ? `${input.bestAlternativeDate} に出発日を変更`
        : null,
      actionType: input.bestAlternativeDate ? "DATE" : null,
      actionData: input.bestAlternativeDate ?? undefined,
    };
  }

  // 4. 良好。「完全にシンクロ」とは言わない。見ていない要素
  //    （階・間取り・家族の事情）はいくらでもある。
  return {
    band: "good",
    bandLabel: BAND_LABEL.good,
    title: "【良好】大きな障りは見当たりません",
    problem: "方位・時期・心身のいずれにも、避けるべき障りは見当たりません。",
    solution: input.bestAlternativeDate
      ? `この計画のまま進めて問題ありません。なお、さらに条件の良い日として【${input.bestAlternativeDate}】もあります。`
      : "この計画のまま進めて問題ありません。",
    actionLabel: null,
    actionType: null,
  };
}
