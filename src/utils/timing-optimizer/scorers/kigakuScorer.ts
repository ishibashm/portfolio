import { EvaluationContext, TimingScorer } from '../types';
import { getDayStar } from '../../ephemerisEngine';

export class KigakuScorer implements TimingScorer {
  name = "Kigaku (Oriental Astrology)";

  observe(ctx: EvaluationContext) {
    if (!ctx.userKigakuStar) {
        return { phenomenon: "Insufficient Data", detail: "本命星の登録がないため観測不能です。" };
    }

    // 正確な天体物理モデリングに基づく日盤の星計算
    const dailyStar = getDayStar(ctx.targetDate);
    
    // 五行の相性判定
    const elementMap: Record<number, string> = {
        1: 'water', 2: 'earth', 3: 'wood', 4: 'wood', 5: 'earth',
        6: 'metal', 7: 'metal', 8: 'earth', 9: 'fire'
    };

    const userElement = elementMap[ctx.userKigakuStar];
    const dailyElement = elementMap[dailyStar];

    // 相生（相性が良い）、相剋（相性が悪い）、比和（同じ）
    const isSojo = (user: string, day: string) => {
        const rules: Record<string, string> = {
            'wood': 'fire', 'fire': 'earth', 'earth': 'metal', 'metal': 'water', 'water': 'wood' // 生じる
        };
        const rules2: Record<string, string> = {
             'fire': 'wood', 'earth': 'fire', 'metal': 'earth', 'water': 'metal', 'wood': 'water' // 生じられる
        };
        return rules[user] === day || rules2[user] === day;
    };

    const isSokoku = (user: string, day: string) => {
        const rules: Record<string, string> = {
            'wood': 'earth', 'earth': 'water', 'water': 'fire', 'fire': 'metal', 'metal': 'wood'
        };
        return rules[user] === day || rules[day] === user;
    };

    if (ctx.userKigakuStar === dailyStar) {
        return { phenomenon: `比和 (同調位相: ${ctx.userKigakuStar})`, detail: `日盤星と本命星が一致しています。本質的なエネルギーが共鳴する状態です。` };
    } else if (isSojo(userElement, dailyElement)) {
        return { phenomenon: `相生 (生成位相: ${userElement} / ${dailyElement})`, detail: `五行理論に基づくエネルギーの循環・増幅作用が確認されます。` };
    } else if (isSokoku(userElement, dailyElement)) {
        return { phenomenon: `相剋 (干渉位相: ${userElement} / ${dailyElement})`, detail: `五行の衝突が発生しています。エネルギーの相殺やノイズが予期されます。` };
    }

    return { phenomenon: `中立 (独立位相: ${userElement} / ${dailyElement})`, detail: `特異な干渉や共鳴は観測されていません。` };
  }
}
