import { EvaluationContext, TimingScorer } from '../types';

export class TimeOfDayScorer implements TimingScorer {
  name = "TimeOfDay (Circadian Rhythm)";
  
  score(ctx: EvaluationContext) {
    const hour = ctx.targetDate.getHours();
    let value = 0.5;
    let reason = "標準的な時間帯です。";

    if (ctx.actionType === 'focus') {
      if (hour >= 8 && hour <= 12) {
        value = 0.9;
        reason = "午前中は認知機能と集中力が最も高まるゴールデンタイムです。";
      } else if (hour >= 13 && hour <= 15) {
        value = 0.4;
        reason = "昼食後は一時的に集中力が低下しやすい時間帯です。";
      } else if (hour >= 16 && hour <= 18) {
        value = 0.7;
        reason = "午後の第二の集中ピークです。実務的な作業に適しています。";
      }
    } else if (ctx.actionType === 'creative') {
      if (hour >= 20 || hour <= 2) {
        value = 0.8;
        reason = "前頭葉の抑制が外れやすく、創造的な作業に向く時間帯です。";
      } else if (hour >= 6 && hour <= 9) {
        value = 0.7;
        reason = "起床直後のリラックスした脳の状態は、アイデア出しに適しています。";
      }
    } else if (ctx.actionType === 'social') {
      if (hour >= 11 && hour <= 15) {
        value = 0.8;
        reason = "ランチタイム前後は、リラックスしたコミュニケーションが取りやすい時間帯です。";
      } else if (hour >= 18 && hour <= 22) {
        value = 0.8;
        reason = "夕方から夜にかけては、社交的な活動が活発になる時間帯です。";
      }
    } else if (ctx.actionType === 'rest') {
       if (hour >= 22 || hour <= 6) {
        value = 0.9;
        reason = "身体と脳の修復のために最も重要な睡眠・休息の時間帯です。";
       } else if (hour >= 13 && hour <= 15) {
        value = 0.8;
        reason = "概日リズムによる眠気が起きやすい時間で、短い仮眠や休息に最適です。";
       }
    }
    
    return { value, reason };
  }
}
