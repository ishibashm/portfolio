import { EvaluationContext, TimingScorer } from "../types";

export class TimeOfDayScorer implements TimingScorer {
  name = "TimeOfDay (Circadian Rhythm)";

  observe(ctx: EvaluationContext) {
    const hour = ctx.targetDate.getHours();
    let phenomenon = "Standard Circadian Phase";
    let detail = "概日リズムにおける標準的なフェーズです。";

    if (ctx.actionType === "focus") {
      if (hour >= 8 && hour <= 12) {
        phenomenon = "Cognitive Peak (Morning)";
        detail =
          "午前中は認知機能と集中力が最も高まる生体リズムのゴールデンタイムです。";
      } else if (hour >= 13 && hour <= 15) {
        phenomenon = "Post-Prandial Dip";
        detail =
          "昼食後の一時的なエネルギー低下（Post-lunch dip）が発生しやすい時間帯です。";
      } else if (hour >= 16 && hour <= 18) {
        phenomenon = "Secondary Cognitive Peak";
        detail = "午後の第二の集中ピークです。実務的な作業に適しています。";
      }
    } else if (ctx.actionType === "creative") {
      if (hour >= 20 || hour <= 2) {
        phenomenon = "Frontal Lobe Relaxation";
        detail =
          "前頭葉の抑制が外れやすく、創造的なアイデア発想に向く夜間フェーズです。";
      } else if (hour >= 6 && hour <= 9) {
        phenomenon = "Hypnopompic State";
        detail =
          "起床直後のリラックスした脳の状態は、直感的なひらめきに適しています。";
      }
    } else if (ctx.actionType === "social") {
      if (hour >= 11 && hour <= 15) {
        phenomenon = "Mid-day Social Receptivity";
        detail =
          "ランチタイム前後は、社会的な受容性が高まりやすいフェーズです。";
      } else if (hour >= 18 && hour <= 22) {
        phenomenon = "Evening Social Drive";
        detail =
          "夕方から夜にかけては、社交的・集団的活動の欲求が活発になる時間帯です。";
      }
    } else if (ctx.actionType === "rest") {
      if (hour >= 22 || hour <= 6) {
        phenomenon = "Deep Cellular Repair";
        detail =
          "身体と脳の修復のために不可欠な、深層の睡眠・休息フェーズです。";
      } else if (hour >= 13 && hour <= 15) {
        phenomenon = "Circadian Dip";
        detail =
          "概日リズムによる眠気が起きやすい時間で、短い仮眠や休息によって回復が見込めます。";
      }
    }

    return { phenomenon, detail };
  }
}
