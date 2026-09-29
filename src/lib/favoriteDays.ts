/**
 * 日取りのお気に入り（利用者の依頼、2026-09-29「日取りもお気に入り
 * できるようにしてほしい」）。
 *
 * 1 件は「日付 × 方位」。同じ日でも方位が違えば判定が違うので、別の
 * お気に入りとして持つ。
 *
 * ## 置き場は端末（localStorage）と、ログイン中はアカウント
 *
 * 端末には必ず置く（favorite_days_v1）。ログインしていればアカウントにも
 * 置く（/api/favorite-days、表は favorite_days。利用者の判断、2026-09-29
 * 「日取りのお気に入りもアカウントに保存していいよ」）。
 *
 * - 画面を開いたとき `syncFavoriteDays` がアカウントの一覧を読み、
 *   **端末にしか無いもの（まだ送っていないもの）を送ってから**、端末を
 *   アカウントの一覧に揃える
 * - 一度アカウントに載ったもの（`synced`）がアカウントから消えていたら、
 *   別の端末で外したとみなして端末からも消す（載せ直さない）
 * - 未ログインなら端末だけで動く。ログインした後に開けば、端末のものが
 *   アカウントへ上がる
 *
 * 「すべて消す」は両方を消す（ACCOUNT_LOCAL_KEYS と DELETE /api/user-config）。
 *
 * **生年月日と座標は入れない。**入れるのは保存した時点の判定の表示
 * （年盤・月盤・日盤の呼び名、暦注、天中殺）だけ。生年月日や出発地を
 * 変えると判定は変わるので、画面には「保存したときの判定」と書く。
 */
import { z } from "zod";
import { isWorkingDate } from "@/lib/workingDate";

export const FAVORITE_DAYS_KEY = "favorite_days_v1";
/** 上限。端末もアカウントも同じ。端末では超えたら古く保存したものから落とす */
export const FAVORITE_DAYS_LIMIT = 60;
const EVENT = "favorite-days-updated";
const API = "/api/favorite-days";

/** 保存時の判定の表示。アカウントの表では verdict 列（JSONB）に入る */
export const favoriteVerdictSchema = z.object({
  directionLabel: z.string().max(20),
  yearLabel: z.string().max(40),
  monthLabel: z.string().max(40),
  dayLabel: z.string().max(40),
  tags: z.array(z.string().max(40)).max(20),
  blockedByTenchusatsu: z.boolean(),
});
export type FavoriteVerdict = z.infer<typeof favoriteVerdictSchema>;

export interface FavoriteDay extends FavoriteVerdict {
  /** YYYY-MM-DD（日本時間の暦日） */
  date: string;
  /** 方位の鍵（N / NE …）。判定 API の direction のまま */
  direction: string;
  /** ISO 8601 */
  savedAt: string;
  /** アカウントに載ったことがあるか。端末の控えだけが持つ */
  synced?: boolean;
}

export function favoriteDayKey(date: string, direction: string): string {
  return `${date}|${direction}`;
}
const keyOf = (f: Pick<FavoriteDay, "date" | "direction">) =>
  favoriteDayKey(f.date, f.direction);

function isFavoriteDay(v: unknown): v is FavoriteDay {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isWorkingDate(o.date) &&
    typeof o.direction === "string" &&
    typeof o.savedAt === "string" &&
    (o.synced === undefined || typeof o.synced === "boolean") &&
    favoriteVerdictSchema.safeParse(o).success
  );
}

function sortByDate(list: FavoriteDay[]): FavoriteDay[] {
  return [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction),
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
  return sortByDate(parsed.filter(isFavoriteDay));
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

const readLocal = () => parseFavoriteDays(favoriteDaysSnapshot());

/**
 * アカウントに繋がっているか。`syncFavoriteDays` が一覧を読めたときだけ
 * 真にする。未ログインの人の ☆ のたびに 401 を返させないため。
 */
let signedIn = false;

function verdictOf(f: FavoriteDay): FavoriteVerdict {
  return {
    directionLabel: f.directionLabel,
    yearLabel: f.yearLabel,
    monthLabel: f.monthLabel,
    dayLabel: f.dayLabel,
    tags: f.tags,
    blockedByTenchusatsu: f.blockedByTenchusatsu,
  };
}

async function pushRemote(
  f: FavoriteDay,
  fetcher: typeof fetch,
): Promise<boolean> {
  try {
    const res = await fetcher(API, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: f.date,
        direction: f.direction,
        verdict: verdictOf(f),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function markSynced(key: string) {
  const list = readLocal();
  if (!list.some((f) => keyOf(f) === key && !f.synced)) return;
  write(list.map((f) => (keyOf(f) === key ? { ...f, synced: true } : f)));
}

/**
 * 入っていれば外し、無ければ足す。書けない端末（プライベートモード
 * など）では false。ログイン中ならアカウントにも同じ操作を送る
 * （送れなくても端末の操作は取り消さない。次の同期で揃う）。
 */
export function toggleFavoriteDay(
  day: Omit<FavoriteDay, "savedAt" | "synced">,
  now: Date = new Date(),
  fetcher: typeof fetch = fetch,
): boolean {
  const list = readLocal();
  const key = keyOf(day);
  if (list.some((f) => keyOf(f) === key)) {
    return removeFavoriteDay(day.date, day.direction, fetcher);
  }
  const added: FavoriteDay = { ...day, savedAt: now.toISOString() };
  const next = [...list, added];
  // 上限を超えたら、保存した順で古いものから落とす
  next.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const ok = write(sortByDate(next.slice(-FAVORITE_DAYS_LIMIT)));
  if (ok && signedIn) {
    void pushRemote(added, fetcher).then((sent) => {
      if (sent) markSynced(key);
    });
  }
  return ok;
}

export function removeFavoriteDay(
  date: string,
  direction: string,
  fetcher: typeof fetch = fetch,
): boolean {
  const key = favoriteDayKey(date, direction);
  const ok = write(readLocal().filter((f) => keyOf(f) !== key));
  if (ok && signedIn) {
    const q = new URLSearchParams({ date, direction });
    void fetcher(`${API}?${q.toString()}`, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => {
      /* 端末からは外れている。アカウント側は次に外したときに揃う */
    });
  }
  return ok;
}

const remoteListSchema = z.object({
  favorites: z.array(z.unknown()),
});

/**
 * アカウントと端末を揃える。画面を開いたときに 1 回呼ぶ。
 *
 * - 未ログイン（401）なら何もしない（端末だけで動く）
 * - 端末にしか無く、まだ送っていないもの（synced でない）を送る
 * - 送ったことがあるのにアカウントに無いものは、別の端末で外したとみなして
 *   端末からも消す
 */
export async function syncFavoriteDays(
  fetcher: typeof fetch = fetch,
): Promise<"synced" | "anonymous" | "failed"> {
  let remote: FavoriteDay[];
  try {
    const res = await fetcher(API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.status === 401) {
      signedIn = false;
      return "anonymous";
    }
    if (!res.ok) return "failed";
    const body = remoteListSchema.safeParse(await res.json());
    if (!body.success) return "failed";
    remote = body.data.favorites
      .filter(isFavoriteDay)
      .map((f) => ({ ...f, synced: true }));
  } catch {
    return "failed";
  }
  signedIn = true;

  const remoteKeys = new Set(remote.map(keyOf));
  const pending = readLocal().filter(
    (f) => !f.synced && !remoteKeys.has(keyOf(f)),
  );
  const uploaded: FavoriteDay[] = [];
  for (const f of pending) {
    const sent = await pushRemote(f, fetcher);
    uploaded.push(sent ? { ...f, synced: true } : f);
  }
  write(sortByDate([...remote, ...uploaded]).slice(0, FAVORITE_DAYS_LIMIT));
  return "synced";
}

/** テスト用。モジュールの中のログイン状態を戻す */
export function resetFavoriteDaysSyncForTest() {
  signedIn = false;
}
