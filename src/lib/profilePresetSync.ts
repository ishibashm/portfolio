export interface ProfilePreset {
  id: string;
  name: string;
  birthDate: string;
  birthLat: number;
  birthLon: number;
  baseLat: number;
  baseLon: number;
  voidZodiacOverride?: string;
  geminiKey?: string;
  baselineHrvMean?: number;
  baselineHrvStd?: number;
  baselineGsrMean?: number;
  baselineGsrStd?: number;
  usePsychologyScorer?: boolean;
  useKigakuScorer?: boolean;
  useAstrologyScorer?: boolean;
  // Relocation Matrix (/relocation/wealth) 固有。他の画面では使わないので任意。
  targetDate?: string;
  engineType?: string;
  layerMode?: string;
  createdAt: string;
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const STORAGE_KEYS = ["profile_presets_v1", "wealth_presets"] as const;

function isProfilePreset(value: unknown): value is ProfilePreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.birthDate === "string" &&
    typeof preset.birthLat === "number" &&
    typeof preset.birthLon === "number" &&
    typeof preset.baseLat === "number" &&
    typeof preset.baseLon === "number" &&
    typeof preset.createdAt === "string"
  );
}

/**
 * /relocation/wealth が独自に localStorage へ書いていた旧形式。
 * 緯度経度が文字列で createdAt を持たないため isProfilePreset を通らず、
 * 変換しないとクラウドへ上がらないまま端末内に取り残される。
 */
function migrateLegacyWealthPreset(value: unknown): ProfilePreset | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.name !== "string") return null;

  const num = (v: unknown) =>
    typeof v === "number" ? v : parseFloat(String(v ?? ""));
  const birthLat = num(p.birthLat);
  const birthLon = num(p.birthLon);
  const baseLat = num(p.baseLat);
  const baseLon = num(p.baseLon);

  // 座標が読めないものは捨てる。0,0 で埋めると別の地点として計算されてしまう。
  if (![birthLat, birthLon, baseLat, baseLon].every(Number.isFinite)) {
    return null;
  }

  return {
    id: p.id,
    name: p.name,
    birthDate: typeof p.birthDate === "string" ? p.birthDate : "",
    birthLat,
    birthLon,
    baseLat,
    baseLon,
    ...(typeof p.targetDate === "string" ? { targetDate: p.targetDate } : {}),
    ...(typeof p.engineType === "string" ? { engineType: p.engineType } : {}),
    ...(typeof p.layerMode === "string" ? { layerMode: p.layerMode } : {}),
    createdAt: new Date().toISOString(),
  };
}

function readLocalPresets(storage: Storage): ProfilePreset[] {
  // 先に見つかったキーで打ち切ると、もう一方のキーにしかないプリセットを
  // 取りこぼす（wealth 側は別スキーマで別キーに書いていた）。両方を統合する。
  const merged = new Map<string, ProfilePreset>();

  for (const key of STORAGE_KEYS) {
    const value = storage.getItem(key);
    if (!value) continue;

    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) continue;

      for (const candidate of parsed) {
        const preset = isProfilePreset(candidate)
          ? candidate
          : migrateLegacyWealthPreset(candidate);
        if (preset && !merged.has(preset.id)) merged.set(preset.id, preset);
      }
    } catch {
      // 壊れたキーは飛ばして、もう一方のキーを見る。
    }
  }

  return [...merged.values()];
}

function cachePresets(storage: Storage, presets: ProfilePreset[]) {
  const serialized = JSON.stringify(presets);
  for (const key of STORAGE_KEYS) {
    storage.setItem(key, serialized);
  }
}

function mergePresets(
  cloudPresets: ProfilePreset[],
  localPresets: ProfilePreset[],
) {
  const merged = new Map(localPresets.map((preset) => [preset.id, preset]));
  for (const preset of cloudPresets) {
    merged.set(preset.id, preset);
  }
  return [...merged.values()];
}

async function uploadPresets(fetcher: Fetcher, presets: ProfilePreset[]) {
  const response = await fetcher("/api/profile-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets }),
  });

  const reason: SyncFailureReason | undefined = response.ok
    ? undefined
    : response.status === 401
      ? "unauthenticated"
      : "offline";

  return { ok: response.ok, reason };
}

/**
 * 未同期の理由は 2 つあり、利用者への案内が変わる:
 *   "unauthenticated" — ログインすれば直る（プリセットが空に見える主因）
 *   "offline"         — 通信の問題。待てば直る
 */
export type SyncFailureReason = "unauthenticated" | "offline";

export interface LoadResult {
  presets: ProfilePreset[];
  cloudSynced: boolean;
  reason?: SyncFailureReason;
}

export async function loadProfilePresets(
  fetcher: Fetcher,
  storage: Storage,
): Promise<LoadResult> {
  const localPresets = readLocalPresets(storage);

  try {
    const response = await fetcher("/api/profile-presets");
    if (!response.ok) {
      return {
        presets: localPresets,
        cloudSynced: false,
        reason: response.status === 401 ? "unauthenticated" : "offline",
      };
    }

    const data: unknown = await response.json();
    const maybePresets =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).presets
        : undefined;
    const presetsInitialized =
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).presets_initialized === true;
    const cloudPresets =
      Array.isArray(maybePresets) && maybePresets.every(isProfilePreset)
        ? maybePresets
        : [];

    if (cloudPresets.length > 0) {
      const mergedPresets = mergePresets(cloudPresets, localPresets);
      const hasLocalOnlyPresets = mergedPresets.length > cloudPresets.length;
      const upload = hasLocalOnlyPresets
        ? await uploadPresets(fetcher, mergedPresets)
        : { ok: true, reason: undefined };
      cachePresets(storage, mergedPresets);
      return {
        presets: mergedPresets,
        cloudSynced: upload.ok,
        reason: upload.reason,
      };
    }

    if (presetsInitialized) {
      cachePresets(storage, []);
      return { presets: [], cloudSynced: true };
    }

    if (localPresets.length > 0) {
      const upload = await uploadPresets(fetcher, localPresets);
      return {
        presets: localPresets,
        cloudSynced: upload.ok,
        reason: upload.reason,
      };
    }

    cachePresets(storage, []);
    return { presets: [], cloudSynced: true };
  } catch {
    return { presets: localPresets, cloudSynced: false, reason: "offline" };
  }
}

export async function saveProfilePresets(
  presets: ProfilePreset[],
  fetcher: Fetcher,
  storage: Storage,
): Promise<{ cloudSynced: boolean; reason?: SyncFailureReason }> {
  cachePresets(storage, presets);

  try {
    const upload = await uploadPresets(fetcher, presets);
    return { cloudSynced: upload.ok, reason: upload.reason };
  } catch {
    return { cloudSynced: false, reason: "offline" };
  }
}
