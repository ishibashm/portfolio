import { EvaluationContext, TimingScorer } from "../types";

export class FreshStartScorer implements TimingScorer {
  name = "Fresh Start (Psychology)";

  observe(ctx: EvaluationContext) {
    const dayOfWeek = ctx.targetDate.getDay(); // 0: 日曜, 1: 月曜...
    const dayOfMonth = ctx.targetDate.getDate(); // 1〜31
    const month = ctx.targetDate.getMonth(); // 0〜11
    let phenomenon = "Neutral Baseline";
    let detail = "日常的な心理状態のフェーズです。";

    // アクションが「休憩」の場合はフレッシュスタート効果の逆（むしろ焦り）になる可能性もあるため除外
    if (ctx.actionType === "rest") {
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        // 金曜・土曜
        phenomenon = "Weekend Relaxation";
        detail = "週末のため、深層的な休息に入る心理的抵抗が低減する時期です。";
      }
      return { phenomenon, detail };
    }

    if (dayOfMonth === 1) {
      if (month === 0) {
        phenomenon = "Annual Fresh Start";
        detail =
          "年初にあたり、自己効力感と新しい行動への動機付けが最も高まる時期です。";
      } else {
        phenomenon = "Monthly Fresh Start";
        detail =
          "月の初めであり、新しい習慣を開始する心理的障壁が低下しています。";
      }
    } else if (dayOfWeek === 1) {
      // 月曜日
      phenomenon = "Weekly Fresh Start";
      detail = "週の初めであり、心理的なリセット効果が作用しています。";
    }

    // 誕生日ボーナス（もしユーザーの生年月日と月日が一致すれば）
    if (ctx.userBirthDate) {
      if (
        ctx.targetDate.getMonth() === ctx.userBirthDate.getMonth() &&
        ctx.targetDate.getDate() === ctx.userBirthDate.getDate()
      ) {
        phenomenon = "Personal Solar Return";
        detail =
          "個人の誕生日。内発的動機づけ（Intrinsic Motivation）が最大化する心理的特異点です。";
      }
    }

    return { phenomenon, detail };
  }
}
