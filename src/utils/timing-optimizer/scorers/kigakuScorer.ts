import { EvaluationContext, TimingScorer } from '../types';
import { getDayStar, getYearStar, getMonthStar, getCurrentZodiac, AstroEngine } from '../../ephemerisEngine';

export class KigakuScorer implements TimingScorer {
  name = "Kigaku (Oriental Astrology)";

  observe(ctx: EvaluationContext) {
    if (!ctx.userKigakuStar) {
        return { phenomenon: "Insufficient Data", detail: "本命星の登録がないため観測不能です。" };
    }

    const yearStar = getYearStar(ctx.targetDate);
    const monthStar = getMonthStar(ctx.targetDate);
    const dailyStar = getDayStar(ctx.targetDate);
    
    const elementMap: Record<number, string> = {
        1: 'water', 2: 'earth', 3: 'wood', 4: 'wood', 5: 'earth',
        6: 'metal', 7: 'metal', 8: 'earth', 9: 'fire'
    };

    const userElement = elementMap[ctx.userKigakuStar];

    const evaluatePhase = (star: number) => {
        const el = elementMap[star];
        if (ctx.userKigakuStar === star) return '比和';
        
        const sojoRules: Record<string, string> = {
            'wood': 'fire', 'fire': 'earth', 'earth': 'metal', 'metal': 'water', 'water': 'wood'
        };
        const sojoRulesReverse: Record<string, string> = {
             'fire': 'wood', 'earth': 'fire', 'metal': 'earth', 'water': 'metal', 'wood': 'water'
        };
        if (sojoRules[userElement] === el || sojoRulesReverse[userElement] === el) return '相生';
        
        const sokokuRules: Record<string, string> = {
            'wood': 'earth', 'earth': 'water', 'water': 'fire', 'fire': 'metal', 'metal': 'wood'
        };
        if (sokokuRules[userElement] === el || sokokuRules[el] === userElement) return '相剋';

        return '独立';
    };

    const yPhase = evaluatePhase(yearStar);
    const mPhase = evaluatePhase(monthStar);
    const dPhase = evaluatePhase(dailyStar);

    const isGood = (p: string) => p === '比和' || p === '相生';
    const overallGood = isGood(yPhase) && isGood(mPhase) && isGood(dPhase);

    // Doyou (土用) & Mabi (間日) Check
    const L0 = AstroEngine.getSolarLongitude(ctx.targetDate);
    let doyouType: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | null = null;
    if (L0 >= 27 && L0 < 45) doyouType = 'SPRING';
    else if (L0 >= 117 && L0 < 135) doyouType = 'SUMMER';
    else if (L0 >= 207 && L0 < 225) doyouType = 'AUTUMN';
    else if (L0 >= 297 && L0 < 315) doyouType = 'WINTER';

    const inDoyou = doyouType !== null;
    let isMabi = false;
    if (inDoyou) {
      const zodiacs = getCurrentZodiac(ctx.targetDate, ctx.longitude || 139.6917);
      if (zodiacs?.dayZodiac) {
        if (doyouType === 'SPRING') isMabi = ['巳', '午', '酉'].includes(zodiacs.dayZodiac);
        else if (doyouType === 'SUMMER') isMabi = ['卯', '辰', '申'].includes(zodiacs.dayZodiac);
        else if (doyouType === 'AUTUMN') isMabi = ['未', '酉', '亥'].includes(zodiacs.dayZodiac);
        else if (doyouType === 'WINTER') isMabi = ['寅', '卯', '巳'].includes(zodiacs.dayZodiac);
      }
    }
    const isDoyouHazard = inDoyou && !isMabi;
    
    let mainPhenomenon = "";
    if (isDoyouHazard) {
      mainPhenomenon = `土用殺 (Doyou Hazard)`;
    } else if (overallGood) {
      mainPhenomenon = `完全共鳴 (Year:${yPhase}/Month:${mPhase}/Day:${dPhase})`;
    } else {
      mainPhenomenon = `混在干渉 (Year:${yPhase}/Month:${mPhase}/Day:${dPhase})`;
    }

    let doyouDetail = isDoyouHazard ? `【大凶・土用殺 (${doyouType === 'SPRING' ? '春土用' : doyouType === 'SUMMER' ? '夏土用' : doyouType === 'AUTUMN' ? '秋土用' : '冬土用'})】土地の契約、引越しなどの基礎に関わる活動は避けてください。 ` : "";

    return { 
      phenomenon: mainPhenomenon, 
      detail: doyouDetail + `[年:${yearStar}(${yPhase})] [月:${monthStar}(${mPhase})] [日:${dailyStar}(${dPhase})] - 年月日の多層的な波長の重なりを評価しています。引越し等の長期滞在ではYear/Monthの相生・比和が極めて重要です。` 
    };
  }
}
