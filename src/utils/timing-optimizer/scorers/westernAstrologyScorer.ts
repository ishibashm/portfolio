import { EvaluationContext, TimingScorer } from '../types';

export class WesternAstrologyScorer implements TimingScorer {
  name = "Western Astrology (Transits & Moon Signs)";

  score(ctx: EvaluationContext) {
    let value = 0.5;
    let reasons: string[] = [];

    // ムーンボイドタイムの判定 (ダミー実装)
    const isVoidOfCourse = this.checkMoonVoidOfCourse(ctx.targetDate);
    if (isVoidOfCourse) {
      if (ctx.actionType === 'creative' || ctx.actionType === 'focus' || ctx.actionType === 'social') {
        value = 0.2; 
        reasons.push("現在は月のボイドタイム（空白の時間）です。重要な決断、新しい契約、大きな発信は避け、現状維持やルーティンワークに徹するのが無難です。");
        return { value, reason: reasons.join(" ") }; 
      } else if (ctx.actionType === 'rest') {
        value = 0.8;
        reasons.push("月のボイドタイムは、情報の整理や休息、瞑想などに最適な時間です。");
      }
    }

    // 現在の月星座 (ダミー実装)
    const currentMoonSign = this.getCurrentMoonSign(ctx.targetDate);
    
    if (ctx.actionType === 'creative') {
      if (['Gemini', 'Libra', 'Aquarius'].includes(currentMoonSign)) {
        value += 0.3;
        reasons.push(`月が${this.translateSign(currentMoonSign)}に滞在しており、情報収集や柔軟なアイデア出し、執筆などのクリエイティブワークに最適なムードです。`);
      } else if (['Pisces', 'Cancer', 'Scorpio'].includes(currentMoonSign)) {
        value += 0.2;
        reasons.push(`月が${this.translateSign(currentMoonSign)}にあり、直感力や芸術的な感性が研ぎ澄まされる時間帯です。`);
      }
    } else if (ctx.actionType === 'focus') {
      if (['Taurus', 'Virgo', 'Capricorn'].includes(currentMoonSign)) {
        value += 0.3;
        reasons.push(`月が${this.translateSign(currentMoonSign)}に位置しています。地道な作業、データの整理、長期計画の立案など、集中力を要する実務に極めて適したタイミングです。`);
      }
    } else if (ctx.actionType === 'social') {
      if (['Aries', 'Leo', 'Sagittarius'].includes(currentMoonSign)) {
        value += 0.3;
        reasons.push(`月が${this.translateSign(currentMoonSign)}にあり、自己表現やリーダーシップ、エネルギッシュな交流やプレゼンテーションに最適なタイミングです。`);
      }
    }

    // ユーザーの太陽星座とのアスペクト (ダミー実装)
    if (ctx.userSunSign) {
      const jupiterTransitSign = this.getCurrentJupiterSign(ctx.targetDate); 
      const isLuckyAspect = this.checkTrineOrConjunct(ctx.userSunSign, jupiterTransitSign);
      
      if (isLuckyAspect) {
        value += 0.2;
        reasons.push(`現在、幸運と拡大の星である木星が、あなたの太陽星座(${this.translateSign(ctx.userSunSign)})に対して調和的な角度を取る「発展期」の真っ只中にあります。大きな一歩を踏み出すのに最適です。`);
      }
    }

    value = Math.max(0.0, Math.min(1.0, value));

    if (reasons.length === 0) {
      reasons.push("占星術的な大きな吉凶の偏りはありません。穏やかな星回りです。");
    }

    return { value, reason: reasons.join(" ") };
  }

  private checkMoonVoidOfCourse(date: Date): boolean {
    // 擬似的に週末の特定時間をボイドタイムとみなす (本来はephemerisEngineなどから計算)
    return date.getDay() === 6 && date.getHours() >= 14 && date.getHours() <= 16; 
  }

  private getCurrentMoonSign(date: Date): string {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    // 擬似的に日によって星座が変わるようにする
    return signs[date.getDate() % 12]; 
  }

  private getCurrentJupiterSign(date: Date): string {
    return 'Taurus'; 
  }

  private checkTrineOrConjunct(natalSign: string, transitSign: string): boolean {
    // 簡易的にエレメントが同じ（トラインになりやすい）場合を吉角とする
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
