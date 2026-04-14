import { EvaluationContext, TimingScorer } from '../types';

export class KigakuScorer implements TimingScorer {
  name = "Kigaku (Oriental Astrology)";

  score(ctx: EvaluationContext) {
    let value = 0.5;
    let reason = "気学的なエネルギーは安定しています。";

    if (!ctx.userKigakuStar) {
        return { value, reason: "ユーザーの本命星情報がないため、気学スコアは標準値となります。" };
    }

    // 簡易的な日盤の星計算（実際は複雑な暦の計算が必要）
    // ここではデモとして、日付から擬似的に1〜9の星を算出
    const getDailyStar = (date: Date) => { 
        return (date.getFullYear() + date.getMonth() + date.getDate()) % 9 + 1; 
    };
    
    const dailyStar = getDailyStar(ctx.targetDate);
    
    // 五行の相性判定
    // 1:一白水星(水), 2:二黒土星(土), 3:三碧木星(木), 4:四緑木星(木), 5:五黄土星(土)
    // 6:六白金星(金), 7:七赤金星(金), 8:八白土星(土), 9:九紫火星(火)
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
        value = 0.8;
        reason = `【比和】あなたの本命星（${ctx.userKigakuStar}）が巡る日です。本来の力を発揮しやすく、主体的なアクションに適しています。`;
    } else if (isSojo(userElement, dailyElement)) {
        value = 0.9;
        reason = `【相生】あなたの持つエネルギーと、この日のエネルギーが互いに高め合います。新しいスタートや発展に最適な日です。`;
    } else if (isSokoku(userElement, dailyElement)) {
        value = 0.3;
        reason = `【相剋】エネルギーが衝突しやすい日です。無理な進行は避け、慎重な確認や休息に充てるのが無難です。`;
    }

    return { value, reason };
  }
}
