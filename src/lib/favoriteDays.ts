/**
 * 日取りのお気に入り（利用者の依頼、2026-09-29「日取りもお気に入り
 * できるようにしてほしい」）。
 *
 * 1 件は「日付 × 方位」。同じ日でも方位が違えば判定が違うので、別の
 * お気に入りとして持つ。
 *
 * ## 置き場は端末だけ（localStorage）
 *
 * 判定は生年月日から出た結果なので、DB に送ると「本人が選んだ日付と方位」
 * がアカウントに紐づいて残る。CLAUDE.md 6 節「個人情報を増やす変更は
 * 先に聞く」に当たるので、アカウントへの同期は入れていない。
 * 「すべて消す」（lib/accountData の ACCOUNT_LOCAL_KEYS）の対象に入れてある。
 *
 * **生年月日と座標は入れない。**入れるのは保存した時点の判定の表示
 * （年盤・月盤・日盤の呼び名、暦注、天中殺）だけ。生年月日や出発地を
 * 変えると判定は変わるので、画面には「保存したときの判定」と書く。
 */
import { isWorkingDate } from "@/lib/workingDate";

export const FAVORITE_DAYS_KEY = "favorite_days_v1";
/** 上限。超えたら古く保存したものから落とす */
export const FAVORITE_DAYS_LIMIT = 60;
const EVENT = "favorite-days-updated";

export interface FavoriteDay {
  /** YYYY-MM-DD（日本時間の暦日） */
  date: string;
  /** 方位の鍵（N / NE …）。判定 API の direction のまま */
  direction: string;
  directionLabel: string;
  yearLabel: string;
  monthLabel: string;
  dayLabel: string;
  tags: string[];
  blockedByTenchusatsu: boolean;
  /** ISO 8601 */
  savedAt: string;
}

export function favoriteDayKey(date: string, direction: string): string {
  return `${date}|${direction}`;
}

function isFavoriteDay(v: unknown): v is FavoriteDay {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isWorkingDate(o.date) &&
    typeof o.direction === "string" &&
    typeof o.directionLabel === "string" &&
    typeof o.yearLabel === "string" &&
    typeof o.monthLabel === "string" &&
    typeof o.dayLabel === "string" &&
    Array.isArray(o.tags) &&
    o.tags.every((t) => typeof t === "string") &&
    typeof o.blockedByTenchusatsu === "boolean" &&
    typeof o.savedAt === "string"
  );
}

/** 文字列（localStorage の中身）から読む。壊れた行は捨てる。日付順 */
export function parseFavoriteDays(raw: string | null): FavoriteDay[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isFavoriteDay)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction),
    );
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** useSyncExternalStore の snapshot。文字列なので同じ中身なら同じ値 */
export function favoriteDaysSnapshot(): string {
  try {
    return storage()?.getItem(FAVORITE_DAYS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function subscribeFavoriteDays(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITE_DAYS_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, cb);
  };
}

function write(list: FavoriteDay[]): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(FAVORITE_DAYS_KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

/**
 * 入っていれば外し、無ければ足す。書けない端末（プライベートモード
 * など）では false。
 */
export function toggleFavoriteDay(
  day: Omit<FavoriteDay, "savedAt">,
  now: Date = new Date(),
): boolean {
  const list = parseFavoriteDays(favoriteDaysSnapshot());
  const key = favoriteDayKey(day.date, day.direction);
  if (list.some((f) => favoriteDayKey(f.date, f.direction) === key)) {
    return write(
      list.filter((f) => favoriteDayKey(f.date, f.direction) !== key),
    );
  }
  const next = [...list, { ...day, savedAt: now.toISOString() }];
  // 上限を超えたら、保存した順で古いものから落とす
  next.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  return write(next.slice(-FAVORITE_DAYS_LIMIT));
}

export function removeFavoriteDay(date: string, direction: string): boolean {
  const key = favoriteDayKey(date, direction);
  return write(
    parseFavoriteDays(favoriteDaysSnapshot()).filter(
      (f) => favoriteDayKey(f.date, f.direction) !== key,
    ),
  );
}
