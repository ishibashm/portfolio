import { Solar, Lunar } from 'lunar-javascript';

export interface BaziData {
  source: string;
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  timePillar: string;
  wuXing: string; // Five elements distribution
}

export class BaziClient {
  public getBazi(date: Date = new Date()): BaziData {
    const solar = Solar.fromDate(date);
    const lunar = Lunar.fromSolar(solar);
    
    const eightChar = lunar.getEightChar();
    
    return {
      source: "lunar-javascript (BaZi)",
      yearPillar: eightChar.getYear(),
      monthPillar: eightChar.getMonth(),
      dayPillar: eightChar.getDay(),
      timePillar: eightChar.getTime(),
      wuXing: `Year: ${eightChar.getYearWuXing()}, Month: ${eightChar.getMonthWuXing()}, Day: ${eightChar.getDayWuXing()}, Time: ${eightChar.getTimeWuXing()}`
    };
  }
}
