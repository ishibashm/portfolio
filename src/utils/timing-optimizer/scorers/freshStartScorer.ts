import { EvaluationContext, TimingScorer } from '../types';

export class FreshStartScorer implements TimingScorer {
  name = "Fresh Start (Psychology)";
  
  score(ctx: EvaluationContext) {
    const dayOfWeek = ctx.targetDate.getDay(); // 0: 日曜, 1: 月曜...
    const dayOfMonth = ctx.targetDate.getDate(); // 1〜31
    const month = ctx.targetDate.getMonth(); // 0〜11
    let value = 0.5;
    let reason = "日常的な心理状態です。";

    // アクションが「休憩」の場合はフレッシュスタート効果の逆（むしろ焦り）になる可能性もあるため除外
    if (ctx.actionType === 'rest') {
      if (dayOfWeek === 5 || dayOfWeek === 6) { // 金曜・土曜
        value = 0.8;
        reason = "週末で心理的にリラックスしやすく、深い休息が取れるタイミングです。";
      }
      return { value, reason };
    }

    if (dayOfMonth === 1) { 
      value = 0.9;
      if (month === 0) {
        reason = "年の初めで、「新しい自分」への期待感が最大化する絶好のスタートタイミングです。";
      } else {
        reason = "月の初めで、新しい習慣を始める心理的ハードルが大きく下がっています。";
      }
    } else if (dayOfWeek === 1) { // 月曜日
      value = 0.8;
      reason = "週の初めで「今週こそは」というフレッシュスタート効果が働きやすい日です。";
    }

    // 誕生日ボーナス（もしユーザーの生年月日と月日が一致すれば）
    if (ctx.userBirthDate) {
      if (ctx.targetDate.getMonth() === ctx.userBirthDate.getMonth() && 
          ctx.targetDate.getDate() === ctx.userBirthDate.getDate()) {
        value = 1.0;
        reason = "あなた自身の誕生日です。個人的な「新年」の始まりであり、行動を起こすための最高の心理的ブーストがかかっています。";
      }
    }

    return { value, reason };
  }
}
