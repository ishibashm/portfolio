/**
 * lunar-javascript の型。**このリポジトリが呼ぶものだけ**を写す
 * （ページ全体を型にしない — #149・#538 と同じ方針）。ライブラリ本体に
 * 型定義は無い。ここに無いメソッドを新しく呼ぶときは、実際の戻り値を
 * 確かめてからここに足すこと。
 *
 * ## fromDate は宣言しない
 *
 * `Solar.fromDate` / `Lunar.fromDate` は**実行環境のタイムゾーン**で
 * 年月日を読む。本番（UTC）では日の境目が日本時間の 9 時になり、
 * 日盤の 37.3% がずれた（#456）。総点検で 0 件にしたが、字面の grep は
 * Lunar 側を 1 件取りこぼした（#623）。宣言から外しておけば、
 * 再び使おうとした時点で tsc が止める。
 */
declare module "lunar-javascript" {
  /** 四柱。取り出しメソッドの綴りがこの語（時柱は Time）。 */
  type PillarType = "Year" | "Month" | "Day" | "Time";

  /** 九星。getIndex() は 0 始まりで、+1 して一白〜九紫の番号にする。 */
  export interface NineStar {
    getIndex(): number;
  }

  /**
   * 節気表の 1 項目（中身は Solar）。
   *
   * **返る時刻は中国標準時（UTC+8）。**日本時間として読むと 1 時間ずれる
   * （`__tests__/solarTermTimezone.test.ts` が固定している）。
   *
   * 呼ぶものだけ写す（#538 の方針）。年月日時分は、時刻帯の食い違いを
   * 検査するために要る。
   */
  export interface JieQiEntry {
    toFullString(): string;
    getYear(): number;
    /** 1〜12。JavaScript の Date と違って 0 始まりではない */
    getMonth(): number;
    getDay(): number;
    getHour(): number;
    getMinute(): number;
  }

  /** 大運 1 期ぶん。 */
  export interface DaYun {
    getStartYear(): number;
    getEndYear(): number;
    getGanZhi(): string;
  }

  export interface Yun {
    getDaYun(): DaYun[];
  }

  /**
   * 八字。柱ごとの取り出しは `get{柱}{項目}` の綴りで並んでいるので、
   * テンプレートリテラル型で写す（baziEngine の動的な呼び出しが通る形。
   * #538 の作法）。
   */
  export type EightChar = {
    [K in `get${PillarType}${
      | "Gan"
      | "Zhi"
      | "ShiShenGan"
      | "DiShi"
      | "NaYin"
      | "WuXing"}`]: () => string;
  } & {
    [K in `get${PillarType}${"HideGan" | "ShiShenZhi"}`]: () => string[];
  } & {
    /** 日柱の空亡（天中殺）の十二支。 */
    getDayXunKong(): string;
    getYun(gender: number): Yun;
  };

  export interface Lunar {
    getEightChar(): EightChar;
    getYearNineStar(): NineStar;
    getMonthNineStar(): NineStar;
    getDayNineStar(): NineStar;
    getYearZhi(): string;
    /** 年支（立春の**瞬間**で切り替わる Exact 系。八字の年柱と同じ境界）。 */
    getYearZhiExact(): string;
    getMonthZhi(): string;
    getDayZhi(): string;
    getDayInGanZhi(): string;
    /** 旧暦の月・日。 */
    getMonth(): number;
    getDay(): number;
    getJieQiTable(): Record<string, JieQiEntry>;
    getDayJiShen(): string[];
    /** 月相の名前。 */
    getYueXiang(): string;
  }

  export interface Solar {
    getLunar(): Lunar;
  }

  export const Solar: {
    /**
     * 唯一の入口。年月日は必ず `getZonedDateTimeFields(date, 9)` で
     * 日本時間に直してから渡す（ephemerisEngine の solarInJst が見本）。
     */
    fromYmdHms(
      year: number,
      month: number,
      day: number,
      hours: number,
      minutes: number,
      seconds: number,
    ): Solar;
  };
}
