import { EvaluationContext, TimingScorer } from "../types";
import { AstroEngine } from "../../ephemerisEngine";

export class WesternAstrologyScorer implements TimingScorer {
  name = "Western Astrology (Transits & Moon Signs)";

  observe(ctx: EvaluationContext) {
    const details: string[] = [];
    let phenomenonName = "Standard Transit";

    // 月のボイドタイムは表示しない。以前は「他の惑星とアスペクトを形成しない
    // 空白の時間帯」と天文計算を装いながら、実装は「土曜の 14〜16 時」を返す
    // だけのモックだった。偽の天文情報を出すくらいなら出さない。
    // 実装するなら、月が現在の星座を出るまでの全惑星とのアスペクト計算が要る。

    // 天文計算に基づく現在の月星座
    const moonLon = AstroEngine.getLunarLongitude(ctx.targetDate);
    const currentMoonSign = this.getSignFromLongitude(moonLon);
    details.push(`月の現在地: ${this.translateSign(currentMoonSign)}。`);

    if (["Gemini", "Libra", "Aquarius"].includes(currentMoonSign)) {
      details.push(
        "風のエレメントを通過中。西洋占星術では、情報のやり取りや対話に向くとされます。",
      );
    } else if (["Pisces", "Cancer", "Scorpio"].includes(currentMoonSign)) {
      details.push(
        "水のエレメントを通過中。西洋占星術では、直感や共感が働きやすいとされます。",
      );
    } else if (["Taurus", "Virgo", "Capricorn"].includes(currentMoonSign)) {
      details.push(
        "地のエレメントを通過中。西洋占星術では、実務や基盤固めに向くとされます。",
      );
    } else if (["Aries", "Leo", "Sagittarius"].includes(currentMoonSign)) {
      details.push(
        "火のエレメントを通過中。西洋占星術では、行動や自己表現に向くとされます。",
      );
    }

    // ユーザーの太陽星座とのアスペクト
    if (ctx.userSunSign) {
      const jupiterLon = AstroEngine.getJupiterLongitude(ctx.targetDate);
      const jupiterTransitSign = this.getSignFromLongitude(jupiterLon);
      const isLuckyAspect = this.checkTrineOrConjunct(
        ctx.userSunSign,
        jupiterTransitSign,
      );

      if (isLuckyAspect) {
        phenomenonName = "Jupiter Harmonious Transit (木星の吉相)";
        details.push(
          `トランジットの木星があなたの太陽星座(${this.translateSign(ctx.userSunSign)})と調和的なアスペクトを形成しています。西洋占星術では、社会的な拡張や発展に良いとされる配置です。`,
        );
      }
    }

    if (details.length === 1) {
      details.push("特筆すべき強いアスペクトはありません。");
    }

    return { phenomenon: phenomenonName, detail: details.join(" ") };
  }

  private getSignFromLongitude(lon: number): string {
    const signs = [
      "Aries",
      "Taurus",
      "Gemini",
      "Cancer",
      "Leo",
      "Virgo",
      "Libra",
      "Scorpio",
      "Sagittarius",
      "Capricorn",
      "Aquarius",
      "Pisces",
    ];
    const index = Math.floor(lon / 30);
    return signs[index % 12];
  }

  private checkTrineOrConjunct(
    natalSign: string,
    transitSign: string,
  ): boolean {
    const elements: Record<string, string> = {
      Aries: "Fire",
      Leo: "Fire",
      Sagittarius: "Fire",
      Taurus: "Earth",
      Virgo: "Earth",
      Capricorn: "Earth",
      Gemini: "Air",
      Libra: "Air",
      Aquarius: "Air",
      Cancer: "Water",
      Scorpio: "Water",
      Pisces: "Water",
    };
    return elements[natalSign] === elements[transitSign];
  }

  private translateSign(sign: string): string {
    const signs: Record<string, string> = {
      Aries: "牡羊座",
      Taurus: "牡牛座",
      Gemini: "双子座",
      Cancer: "蟹座",
      Leo: "獅子座",
      Virgo: "乙女座",
      Libra: "天秤座",
      Scorpio: "蠍座",
      Sagittarius: "射手座",
      Capricorn: "山羊座",
      Aquarius: "水瓶座",
      Pisces: "魚座",
    };
    return signs[sign] || sign;
  }
}
