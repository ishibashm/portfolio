/**
 * スマート検索。自然文の検索語を、画面が既に持っている絞り込み条件へ落とす。
 *
 * 「姫路 2LDK 8万円以下 駅徒歩10分 築15年以内 北東 吉方位のみ」のような
 * 入力を、家賃上限・間取り・駅徒歩・築年数・方位・吉凶・キーワードに分解する。
 *
 * まずここ（決定的パーサ）で解釈する。LLM は /api/rentals/parse-query に
 * 置いてあるが、それはこのパーサが構造を1つも拾えなかった純粋な自然文
 * （「静かで広めの部屋がいい」など）の保険であって、主役ではない。
 * 家賃や間取りのような定型表現は、正規表現のほうが速く・無料で・確実に
 * 同じ結果を返す。LLM を通すのは曖昧さが残ったときだけでよい。
 *
 * 値の意味は page.tsx のフィルタ state に合わせてある。
 *   maxRentMan     万円。filterMaxRent と同じ単位
 *   maxBuildingAge 年。filterMaxAge
 *   maxStationMin  分。filterMaxStation
 *   minSizeSqm     ㎡。filterMinSize
 *   direction      「北」「北東」…の8方位。filterDirection
 *   luckyOnly      凶（NOISE 系ステータス）を除外する
 *   status         「OPTIMAL」など。filterStatus
 *   layouts        「1LDK」「2DK」…。正規化済み
 *   keywords       残り。物件名・住所の部分一致に使う
 */

export interface SmartFilters {
  maxRentMan?: number;
  minRentMan?: number;
  maxBuildingAge?: number;
  maxStationMin?: number;
  minSizeSqm?: number;
  direction?: string;
  luckyOnly?: boolean;
  status?: string;
  layouts: string[];
  keywords: string[];
}

const DIRECTIONS = [
  "北東",
  "南東",
  "南西",
  "北西",
  "北",
  "東",
  "南",
  "西",
] as const;

/** 全角英数字・記号のゆらぎを揃える */
function normalize(input: string): string {
  return input
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/[〜～]/g, "~")
    .replace(/[、，]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 間取り表記を「2LDK」の形へ。ワンルームは 1R に寄せる */
export function normalizeLayout(raw: string): string {
  const s = raw.toUpperCase().replace("ワンルーム", "1R");
  const m = s.match(/^([1-9])\s*(R|K|DK|LDK|SLDK|SDK)$/);
  return m ? `${m[1]}${m[2]}` : s;
}

/**
 * 解釈できた部分は文字列から取り除き、残りをキーワードにする。
 * 「消費した」ことを明示しないと、家賃の「8万円以下」が住所検索にも
 * かかって 0 件になる。
 */
export function parseSmartQuery(rawQuery: string): SmartFilters {
  let q = normalize(rawQuery);
  const out: SmartFilters = { layouts: [], keywords: [] };
  const consume = (re: RegExp, fn: (m: RegExpMatchArray) => void): void => {
    const m = q.match(re);
    if (m) {
      fn(m);
      q = q.replace(re, " ");
    }
  };

  // 家賃。範囲「6~8万」を先に見る。単独の「8万(円)(以下)」は上限。
  consume(/(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*万円?/, (m) => {
    out.minRentMan = parseFloat(m[1]);
    out.maxRentMan = parseFloat(m[2]);
  });
  consume(/(\d+(?:\.\d+)?)\s*万円?\s*(以下|以内|まで)?/, (m) => {
    out.maxRentMan = parseFloat(m[1]);
  });

  // 築年数。新築・築浅は慣用の値に倒す。
  consume(/築\s*(\d+)\s*年\s*(以内|以下|未満)?/, (m) => {
    out.maxBuildingAge = parseInt(m[1], 10);
  });
  consume(/新築/, () => {
    out.maxBuildingAge = 1;
  });
  consume(/築浅/, () => {
    out.maxBuildingAge = 10;
  });

  // 駅徒歩。「駅近」は徒歩10分扱い。
  consume(/(?:駅\s*)?徒歩\s*(\d+)\s*分\s*(以内|以下)?/, (m) => {
    out.maxStationMin = parseInt(m[1], 10);
  });
  consume(/駅近/, () => {
    out.maxStationMin = 10;
  });

  // 広さ。「30㎡以上」「30平米」。
  consume(/(\d+(?:\.\d+)?)\s*(?:㎡|平米|m2|平方メートル)\s*(以上)?/i, (m) => {
    out.minSizeSqm = parseFloat(m[1]);
  });

  // 間取り。複数書けるので全部拾う。
  {
    const re = /\b([1-9])\s*(SLDK|SDK|LDK|DK|R|K)\b/gi;
    let m: RegExpExecArray | null;
    const found: string[] = [];
    while ((m = re.exec(q)) !== null) {
      found.push(normalizeLayout(`${m[1]}${m[2]}`));
    }
    if (/ワンルーム/.test(q)) found.push("1R");
    if (found.length > 0) {
      out.layouts = [...new Set(found)];
      q = q.replace(re, " ").replace(/ワンルーム/g, " ");
    }
  }

  // 吉凶。「大吉のみ」は OPTIMAL、「吉方位」「凶を避ける」は凶の除外。
  consume(/大吉(?:のみ|だけ|限定)/, () => {
    out.status = "OPTIMAL";
  });
  consume(
    /(吉方位(?:のみ|だけ|限定)?|凶(?:方位)?(?:を)?(?:避け|除|外)\S*|凶以外)/,
    () => {
      out.luckyOnly = true;
    },
  );

  // 方位。「北東」単独か「北東方位/方角/側/方面/向き」。
  // 裸の一文字（西など）は地名（西宮…）と衝突するため、単独トークンの
  // ときだけ方位とみなす。トークン分割後に判定する。
  const dirSuffix =
    /^(北東|南東|南西|北西|北|東|南|西)(方位|方角|側|方面|向き|エリア)$/;
  const tokens = q.split(" ").filter(Boolean);
  const rest: string[] = [];
  for (const t of tokens) {
    if (out.direction === undefined) {
      if ((DIRECTIONS as readonly string[]).includes(t)) {
        out.direction = t;
        continue;
      }
      const m = t.match(dirSuffix);
      if (m) {
        out.direction = m[1];
        continue;
      }
    }
    rest.push(t);
  }

  out.keywords = rest;
  return out;
}

/** 何かひとつでも構造として解釈できたか。純粋な自然文の判定に使う */
export function hasStructuredFilters(f: SmartFilters): boolean {
  return (
    f.maxRentMan !== undefined ||
    f.minRentMan !== undefined ||
    f.maxBuildingAge !== undefined ||
    f.maxStationMin !== undefined ||
    f.minSizeSqm !== undefined ||
    f.direction !== undefined ||
    f.luckyOnly === true ||
    f.status !== undefined ||
    f.layouts.length > 0
  );
}
