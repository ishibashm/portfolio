import { AREAS } from "@/lib/areaContent";
import type { MergedNewsItem } from "@/lib/fetchNews";

/**
 * 「その地域のニュース」を、全国のフィードから地名で拾う。
 *
 * ## 取得先は増やさない
 *
 * 自治体ごとの配信を新しく巡回すると、相手のサーバへ行く回数がその数
 * だけ増える。ここは**既に取っている `/news` の見出しを地名で絞るだけ**で、
 * ネットワークには触らない。純粋関数なのでそのまま検査できる。
 *
 * ## 地名の一致はゆるくしない
 *
 * 「東区」「中央区」「北区」のような区名は全国に何度も出る。素朴に
 * 部分一致を取ると、**新潟市東区の頁に広島市東区のニュースが出る**。
 * だから、区や市の名前を鍵に使ってよいのは**その名前が 1 つの都道府県
 * にしか現れないとき**にする。判断は `areaDirections.json` の実データ
 * から数えるので、掲載が増えても自動で追随する（手で禁止語の一覧を
 * 書かない）。
 *
 * **「何回出てくるか」で数えないこと。**「新潟市」は 8 つの区から
 * 候補として上がるので出現数は 8 だが、指している場所は 1 つしかない。
 * 出現数で切ると、政令市の名前がまるごと鍵から落ちる（実際に落ちた）。
 * 数えるのは**都道府県の異なり数**。
 *
 * ひとつしかない名前でなければ、その頁は**県名だけ**で拾う。市の
 * ニュースが県のニュースに混ざるが、別の県の同名の区が出るよりましで、
 * どの鍵で当たったかは呼ぶ側に返すので画面で断れる。
 *
 * ## 県名は接尾辞ごと使う
 *
 * 「大分」「三重」のように、県名から接尾辞を外すと普通の語になるものが
 * ある。**「県」「府」「都」を付けたまま**照合する。「北海道」はそれ
 * 自体が接尾辞つきなのでそのまま使える。
 */

/** 見出しのどこを見るか。本文は持っていないので、題と要約の先頭だけ。 */
function haystack(m: MergedNewsItem): string {
  return `${m.item.title} ${m.item.summary ?? ""}`;
}

/**
 * 1 つの都道府県にしか現れない市区町村名の集合。
 *
 * `full`（県名込み）ではなく、県名を取り除いた部分で見る。
 * 「新潟市東区」も「新潟市」も新潟県にしか無いので鍵になる。
 * 「東区」は北海道・新潟県・広島県…に出るので鍵にならない。
 */
let uniqueNamesCache: Set<string> | null = null;

function uniqueCityNames(): Set<string> {
  if (uniqueNamesCache) return uniqueNamesCache;
  const prefsByName = new Map<string, Set<string>>();
  for (const a of AREAS) {
    for (const name of cityNameCandidates(a.pref, a.full)) {
      let prefs = prefsByName.get(name);
      if (!prefs) {
        prefs = new Set();
        prefsByName.set(name, prefs);
      }
      prefs.add(a.pref);
    }
  }
  const out = new Set<string>();
  for (const [name, prefs] of prefsByName) if (prefs.size === 1) out.add(name);
  uniqueNamesCache = out;
  return out;
}

/**
 * その市区町村を指しうる名前。県名を外した全体と、政令市の市の部分。
 *
 *   新潟県新潟市東区 → ["新潟市東区", "新潟市"]
 *   東京都台東区     → ["台東区"]
 *   静岡県菊川市     → ["菊川市"]
 */
export function cityNameCandidates(pref: string, full: string): string[] {
  const body = full.startsWith(pref) ? full.slice(pref.length) : full;
  if (!body) return [];
  const out = [body];
  /* 政令市の区は「◯◯市」でも呼ばれる。市の部分を足す */
  const at = body.indexOf("市");
  if (at > 0 && at < body.length - 1) out.push(body.slice(0, at + 1));
  return out;
}

/** どの粒度で当たったか。画面の見出しを変えるために返す。 */
export type LocalNewsScope = "city" | "pref";

export interface LocalNewsMatch {
  item: MergedNewsItem;
  scope: LocalNewsScope;
  /** 実際に当たった地名。画面で色を付けるために返す。 */
  matched: string;
}

export interface LocalNewsKeys {
  /** 「新潟県」のように接尾辞ごと。 */
  pref: string;
  /** 1 つの都道府県にしか現れない名前だけが入る。空のこともある。 */
  city: string[];
}

/**
 * その市区町村を拾うための鍵を組む。
 *
 * @param pref 「新潟県」など、接尾辞つきの県名
 * @param full 「新潟県新潟市東区」など、県名込みの表記
 */
export function localNewsKeys(pref: string, full: string): LocalNewsKeys {
  const unique = uniqueCityNames();
  return {
    pref,
    city: cityNameCandidates(pref, full).filter((n) => unique.has(n)),
  };
}

/**
 * 見出しを地名で絞る。市の名前で当たったものを先に、県だけのものを後に。
 *
 * 同じ見出しは 1 回だけ（市と県の両方に当たっても重ねない）。
 * 並びは呼ぶ側が渡した順（＝日付順）をそのまま保つ。
 */
export function filterLocalNews(
  items: readonly MergedNewsItem[],
  keys: LocalNewsKeys,
  limit: number,
): LocalNewsMatch[] {
  const city: LocalNewsMatch[] = [];
  const pref: LocalNewsMatch[] = [];
  const seen = new Set<string>();

  for (const m of items) {
    const text = haystack(m);
    const hitCity = keys.city.find((n) => text.includes(n));
    if (hitCity) {
      if (seen.has(m.item.link)) continue;
      seen.add(m.item.link);
      city.push({ item: m, scope: "city", matched: hitCity });
      continue;
    }
    if (keys.pref && text.includes(keys.pref)) {
      if (seen.has(m.item.link)) continue;
      seen.add(m.item.link);
      pref.push({ item: m, scope: "pref", matched: keys.pref });
    }
  }

  return [...city, ...pref].slice(0, limit);
}

/** 検査と開発のために、覚えを捨てられるようにしておく。 */
export function resetLocalNewsCache(): void {
  uniqueNamesCache = null;
}
