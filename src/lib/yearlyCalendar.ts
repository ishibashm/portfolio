import {
  buildMonthlyCalendar,
  type CalendarDay,
  type MonthlyCalendar,
} from "./monthlyCalendar";
import { getYearDirections, STARS } from "./kigakuContent";

/**
 * 「その年の天赦日・一粒万倍日・引越しに向く日」を 1 年ぶんまとめる。
 *
 * 月別の頁（/calendar/YYYY-MM）は「何月に動くか」が決まった人の入口で、
 * 「2027 年の天赦日はいつか」「来年はいつ動けるか」という**年で引く問い**
 * に答える面が無かった。年末年始にいちばん増える探し方なのに、12 頁を
 * 開いて回らないと答えが揃わない。
 *
 * **計算をここで持たない。**日ごとの判定も「向く日」の条件も
 * `buildMonthlyCalendar` のものをそのまま集める。年の頁と月の頁で
 * 同じ日の答えが割れると、どちらが正しいのか利用者には分からない。
 */

/** 年盤で本命星に関係なく凶になる方位の名前。 */
const SHARED_BAD_LABELS = ["五黄殺", "暗剣殺", "歳破"];

export interface TenshaDay {
  day: CalendarDay;
  month: number;
  /** 月別の頁の「引越しに向く日」に入っているか */
  usable: boolean;
  /** 入っていない理由（頁にそのまま出す）。入っているときは null */
  reason: string | null;
}

export interface YearlyMonth {
  month: number;
  recommended: CalendarDay[];
  ichiryumanbai: CalendarDay[];
  taian: CalendarDay[];
}

export interface YearlyCalendar {
  year: number;
  /** 年盤の中宮 */
  centerStar: number;
  months: YearlyMonth[];
  tensha: TenshaDay[];
  /** 天赦日と一粒万倍日が同じ日に重なる日 */
  doubleLucky: TenshaDay[];
  /** その年に掛かる土用（始まりの早い順。年をまたぐものは含めない） */
  doyou: { start: string; end: string }[];
  /** 年盤で全員に凶の方位（五黄殺・暗剣殺・歳破） */
  sharedBad: { jp: string; label: string }[];
  totals: {
    recommended: number;
    ichiryumanbai: number;
    taian: number;
  };
}

const TENSHA = "天赦日";
const ICHIRYU = "一粒万倍日";

/**
 * 天赦日が「向く日」から外れた理由。条件は buildMonthlyCalendar の
 * recommended と同じ順（六曜 → 土用）で読む。写しではなく、外れた日に
 * ついて「どちらで落ちたか」を言い分けるだけ。
 */
function reasonNotUsable(day: CalendarDay): string {
  if (day.rokuyo === "仏滅" || day.rokuyo === "赤口") {
    return `${day.rokuyo}と重なる`;
  }
  if (day.inDoyou && !day.isMabi) return "土用の期間で、間日ではない";
  return "条件を満たさない";
}

export function buildYearlyCalendar(year: number): YearlyCalendar {
  const monthly: MonthlyCalendar[] = [];
  for (let m = 1; m <= 12; m++) monthly.push(buildMonthlyCalendar(year, m));

  const months: YearlyMonth[] = monthly.map((cal) => ({
    month: cal.month,
    recommended: cal.recommended,
    ichiryumanbai: cal.days.filter((d) => d.luckyLabels.includes(ICHIRYU)),
    taian: cal.days.filter((d) => d.rokuyo === "大安"),
  }));

  const tensha: TenshaDay[] = monthly.flatMap((cal) =>
    cal.days
      .filter((d) => d.luckyLabels.includes(TENSHA))
      .map((day) => {
        const usable = cal.recommended.some((r) => r.date === day.date);
        return {
          day,
          month: cal.month,
          usable,
          reason: usable ? null : reasonNotUsable(day),
        };
      }),
  );

  // 土用は月をまたぐので、同じ期間が 2 か月ぶん返る。始まりで畳む。
  // 前年から続く期間（始まりが前年）は、この年の一覧には入れない。
  const doyouByStart = new Map<string, { start: string; end: string }>();
  for (const cal of monthly) {
    if (!cal.doyou) continue;
    if (!cal.doyou.start.startsWith(`${year}-`)) continue;
    doyouByStart.set(cal.doyou.start, cal.doyou);
  }

  // 本命星によっては同じ方位が本命殺などの名前で出るので、9 星ぶんを
  // 見て、全員に共通の名前（五黄殺・暗剣殺・歳破）だけを拾う。
  const sharedBad = new Map<string, { jp: string; label: string }>();
  let centerStar = 0;
  for (const star of STARS) {
    const { centerStar: c, verdicts } = getYearDirections(year, star);
    centerStar = c;
    for (const v of verdicts) {
      if (!SHARED_BAD_LABELS.includes(v.label)) continue;
      sharedBad.set(`${v.label}:${v.jp}`, { jp: v.jp, label: v.label });
    }
  }

  return {
    year,
    centerStar,
    months,
    tensha,
    doubleLucky: tensha.filter((t) => t.day.luckyLabels.includes(ICHIRYU)),
    doyou: [...doyouByStart.values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
    sharedBad: [...sharedBad.values()].sort(
      (a, b) =>
        SHARED_BAD_LABELS.indexOf(a.label) - SHARED_BAD_LABELS.indexOf(b.label),
    ),
    totals: {
      recommended: months.reduce((n, m) => n + m.recommended.length, 0),
      ichiryumanbai: months.reduce((n, m) => n + m.ichiryumanbai.length, 0),
      taian: months.reduce((n, m) => n + m.taian.length, 0),
    },
  };
}

/** 西暦を元号つきで書く。令和より前は西暦だけ（この頁では使わない範囲）。 */
export function eraYearLabel(year: number): string {
  return year >= 2019 ? `${year}年（令和${year - 2018}年）` : `${year}年`;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 「2月28日（日・大安）」。年の頁の本文と FAQ が同じ書き方で日を挙げる。
 * 六曜を別の列に出す表では `withRokuyo` を false にして「2月28日（日）」。
 */
export function yearDayLabel(day: CalendarDay, withRokuyo = true): string {
  const month = Number(day.date.slice(5, 7));
  const tail = withRokuyo ? `・${day.rokuyo}` : "";
  return `${month}月${day.day}日（${WEEKDAY_JP[day.weekday]}${tail}）`;
}

/** 「1月17日〜2月3日」 */
export function periodLabel(p: { start: string; end: string }): string {
  const md = (iso: string) =>
    `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
  return `${md(p.start)}〜${md(p.end)}`;
}

/**
 * 年の頁に出す問いと答え。
 *
 * **頁に出す文言と FAQPage の文言を同じ配列から作る。**構造化データに
 * だけ問答を書くのは Google の規定に反する（`FaqJsonLd` の注意）。
 * 数字と日付はすべて集計から組むので、暦と食い違う文は書けない。
 */
export function yearlyCalendarFaq(
  cal: YearlyCalendar,
): { question: string; answer: string }[] {
  const { year } = cal;
  const list = (days: TenshaDay[]) =>
    days.map((t) => yearDayLabel(t.day)).join("、");
  const usableTensha = cal.tensha.filter((t) => t.usable);
  const usableDouble = cal.doubleLucky.filter((t) => t.usable);

  const tenshaAnswer =
    `${year}年の天赦日は、${list(cal.tensha)}の${cal.tensha.length}日です。` +
    (usableTensha.length > 0
      ? `このうち仏滅・赤口と重ならず、土用（間日を除く）にも掛からないのは、${list(usableTensha)}の${usableTensha.length}日です。`
      : "このうち仏滅・赤口と重ならず、土用（間日を除く）にも掛からない日はありません。");

  const doubleAnswer =
    cal.doubleLucky.length === 0
      ? `${year}年は、天赦日と一粒万倍日が同じ日に重なる日がありません。`
      : `${year}年に天赦日と一粒万倍日が重なるのは、${list(cal.doubleLucky)}の${cal.doubleLucky.length}日です。` +
        (usableDouble.length > 0
          ? `このうち六曜と土用の条件も満たして引越しの候補に残るのは、${list(usableDouble)}です。`
          : "ただし、どの日も仏滅・赤口か土用と重なるため、このサイトの「引越しに向く日」には入りません。");

  const doyouAnswer =
    `${year}年の土用は、${cal.doyou.map(periodLabel).join("、")}の${cal.doyou.length}回です。` +
    "土用のあいだは土を動かすことや移転を避けるとされ、このサイトでは間日を除いて引越しの候補から外しています。";

  const badList = cal.sharedBad.map((b) => `${b.jp}（${b.label}）`).join("・");
  const directionAnswer =
    "天赦日と一粒万倍日は日そのものの吉で、方位とは別に決まります。九星気学では、凶方位へ動く日が天赦日でも方位の凶は消えないとされます。" +
    (badList
      ? `${year}年の年盤では${badList}が本命星に関係なく凶で、日をどう選んでも1年のあいだ変わりません。`
      : "方位は年盤・月盤と本命星で決まるので、日取りとは別に確かめる必要があります。");

  return [
    { question: `${year}年の天赦日はいつですか`, answer: tenshaAnswer },
    {
      question: `${year}年に天赦日と一粒万倍日が重なる日はいつですか`,
      answer: doubleAnswer,
    },
    {
      question: `${year}年の土用はいつからいつまでですか`,
      answer: doyouAnswer,
    },
    {
      question:
        "天赦日や一粒万倍日なら、凶方位への引越しでも差し支えありませんか",
      answer: directionAnswer,
    },
  ];
}

/**
 * llms-full.txt に載せる、その年の日取りの要点（Markdown の箇条書き）。
 *
 * 記事の行に説明文を載せたのと同じ理由。AI が頁を開かずに「その年の
 * 天赦日はいつか」を引けるよう、答えそのもの（日付と数）を置く。
 * 文は頁の FAQ と同じ集計から組む。
 */
export function yearlyCalendarLlmsLines(
  cal: YearlyCalendar,
  baseUrl: string,
): string {
  const [tensha, double, doyou] = yearlyCalendarFaq(cal).map((f) => f.answer);
  const badList = cal.sharedBad.map((b) => `${b.jp}（${b.label}）`).join("・");
  return [
    `### ${cal.year}年（${baseUrl}/calendar/${cal.year}）`,
    `- 天赦日: ${tensha}`,
    `- 天赦日と一粒万倍日の重なり: ${double}`,
    `- 日数: 一粒万倍日 ${cal.totals.ichiryumanbai} 日、大安 ${cal.totals.taian} 日。仏滅・赤口と土用（間日を除く）を外した「引越しに向く日」は ${cal.totals.recommended} 日。`,
    `- 土用: ${doyou}`,
    badList
      ? `- 年盤で本命星に関係なく凶の方位: ${badList}。日取りでは変わりません。`
      : "- 年盤: 五黄土星が中宮のため、五黄殺・暗剣殺の方位はありません。",
  ].join("\n");
}
