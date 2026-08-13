/**
 * お気に入りに入れた物件の id を持つところ。
 *
 * 保存先は 2 つある。**呼ぶ側はどちらかを気にしない。**
 *
 *   ログイン中   `/api/favorites`（別の端末でも残る）
 *   未ログイン   localStorage（この端末だけ）
 *
 * 未ログインでも押せるようにしてある。★ を押した時点でログインを要求すると、
 * 「気になる物件を控える」という一番軽い操作の前に一番重い操作が挟まる。
 * 端末に貯めておいて、ログインしたときにまとめてクラウドへ寄せる。
 * プロフィールプリセット（lib/profilePresetSync）が同じ道を辿っている。
 *
 * **クラウド側が落ちていても操作は成立させる。**テーブルの適用前や通信の
 * 失敗で ★ が押せないと、利用者には「壊れている」としか見えない。端末には
 * 必ず書き、クラウドは後追いで合わせる。
 */

const STORAGE_KEY = "favorite_properties_v1";

/** localStorage から読む。壊れていたら空として扱う。 */
export function readLocalFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // プライベートモードや壊れた JSON。お気に入りが無いのと同じ扱いにする。
    return [];
  }
}

function writeLocalFavorites(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* 保存できなくても操作は止めない */
  }
}

/**
 * 一覧を取る。
 *
 * クラウドが読めたら、**端末に貯まっていたものを差し込んでから**返す。
 * 未ログインのあいだに入れたものが、ログインした瞬間に消えたように
 * 見えるのを防ぐ。差し込みは後追いなので、失敗しても一覧は返す。
 */
export async function loadFavorites(): Promise<{
  ids: string[];
  /** クラウドに保存できているか。false なら端末だけ。 */
  synced: boolean;
}> {
  const local = readLocalFavorites();

  let res: Response;
  try {
    res = await fetch("/api/favorites");
  } catch {
    return { ids: local, synced: false };
  }

  if (!res.ok) return { ids: local, synced: false };

  let cloud: string[];
  try {
    const body = (await res.json()) as { propertyIds?: unknown };
    cloud = Array.isArray(body.propertyIds)
      ? body.propertyIds.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return { ids: local, synced: false };
  }

  // 端末にだけあるものをクラウドへ寄せる。1 件ずつで足りる件数。
  const missing = local.filter((id) => !cloud.includes(id));
  await Promise.all(missing.map((id) => pushToCloud(id)));
  if (missing.length > 0) writeLocalFavorites([]);

  return { ids: [...missing, ...cloud], synced: true };
}

async function pushToCloud(propertyId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 入れる。クラウドが駄目でも端末には残す。 */
export async function addFavorite(propertyId: string): Promise<boolean> {
  const ok = await pushToCloud(propertyId);
  if (!ok) {
    const local = readLocalFavorites();
    if (!local.includes(propertyId)) {
      writeLocalFavorites([propertyId, ...local]);
    }
  }
  return ok;
}

/** 外す。両方から消す。片方にだけ残ると、次に開いたとき復活する。 */
export async function removeFavorite(propertyId: string): Promise<boolean> {
  writeLocalFavorites(readLocalFavorites().filter((id) => id !== propertyId));
  try {
    const res = await fetch(
      `/api/favorites?propertyId=${encodeURIComponent(propertyId)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch {
    return false;
  }
}
