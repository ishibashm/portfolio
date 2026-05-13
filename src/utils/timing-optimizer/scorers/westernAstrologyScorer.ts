import { EvaluationContext, TimingScorer } from '../types';
import { AstroEngine } from '../../ephemerisEngine';

export class WesternAstrologyScorer implements TimingScorer {
  name = "Western Astrology (Transits & Moon Signs)";

  observe(ctx: EvaluationContext) {
    const details: string[] = [];
    let phenomenonName = "Standard Transit";

    // ムーンボイドタイムの判定 (暫定モック: 後日AstroEngineのアスペクト計算に置換可能)
    const isVoidOfCourse = this.checkMoonVoidOfCourse(ctx.targetDate);
    if (isVoidOfCourse) {
      phenomenonName = "Moon Void of Course (月のボイドタイム)";
      details.push("月が次の星座に移動するまで、他の惑星とメジャーアスペクトを形成しない空白の時間帯です。重要な決定の延期が推奨されます。");
    }

    // 正確な天体物理モデリングに基づく現在の月星座
    const moonLon = AstroEngine.getLunarLongitude(ctx.targetDate);
    const currentMoonSign = this.getSignFromLongitude(moonLon);
    details.push(`月の現在地: ${this.translateSign(currentMoonSign)}。`);
    
    if (['Gemini', 'Libra', 'Aquarius'].includes(currentMoonSign)) {
      details.push("風のエレメントを通過中。情報流通とコミュニケーションが活性化するフェーズです。");
    } else if (['Pisces', 'Cancer', 'Scorpio'].includes(currentMoonSign)) {
      details.push("水のエレメントを通過中。直感力や共感性が高まる感情的なフェーズです。");
    } else if (['Taurus', 'Virgo', 'Capricorn'].includes(currentMoonSign)) {
      details.push("地のエレメントを通過中。物質的・現実的な基盤固めや実務的な処理に適したフェーズです。");
    } else if (['Aries', 'Leo', 'Sagittarius'].includes(currentMoonSign)) {
      details.push("火のエレメントを通過中。情熱と自己表現、行動力がブーストされるフェーズです。");
    }

    // ユーザーの太陽星座とのアスペクト
    if (ctx.userSunSign) {
      const jupiterLon = AstroEngine.getJupiterLongitude(ctx.targetDate); 
      const jupiterTransitSign = this.getSignFromLongitude(jupiterLon);
      const isLuckyAspect = this.checkTrineOrConjunct(ctx.userSunSign, jupiterTransitSign);
      
      if (isLuckyAspect) {
        phenomenonName = "Jupiter Harmonious Transit (木星の吉相)";
        details.push(`トランジットの木星があなたの太陽星座(${this.translateSign(ctx.userSunSign)})と調和的なアスペクトを形成しており、社会的拡張や発展のエネルギーが注がれています。`);
      }
    }

    if (details.length === 1 && !isVoidOfCourse) {
      details.push("特筆すべき強いアスペクトは観測されませんでした。");
    }

    return { phenomenon: phenomenonName, detail: details.join(" ") };
  }

  private checkMoonVoidOfCourse(date: Date): boolean {
    return date.getDay() === 6 && date.getHours() >= 14 && date.getHours() <= 16; 
  }

  private getSignFromLongitude(lon: number): string {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    const index = Math.floor(lon / 30);
    return signs[index % 12]; 
  }

  private checkTrineOrConjunct(natalSign: string, transitSign: string): boolean {
    const elements: Record<string, string> = {
        'Aries': 'Fire', 'Leo': 'Fire', 'Sagittarius': 'Fire',
        'Taurus': 'Earth', 'Virgo': 'Earth', 'Capricorn': 'Earth',
        'Gemini': 'Air', 'Libra': 'Air', 'Aquarius': 'Air',
        'Cancer': 'Water', 'Scorpio': 'Water', 'Pisces': 'Water'
    };
    return elements[natalSign] === elements[transitSign];
  }

  private translateSign(sign: string): string {
    const signs: Record<string, string> = {
      'Aries': '牡羊座', 'Taurus': '牡牛座', 'Gemini': '双子座', 'Cancer': '蟹座',
      'Leo': '獅子座', 'Virgo': '乙女座', 'Libra': '天秤座', 'Scorpio': '蠍座',
      'Sagittarius': '射手座', 'Capricorn': '山羊座', 'Aquarius': '水瓶座', 'Pisces': '魚座'
    };
    return signs[sign] || sign;
  }
}
