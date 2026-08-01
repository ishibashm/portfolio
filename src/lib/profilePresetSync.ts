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

function readLocalPresets(storage: Storage): ProfilePreset[] {
  for (const key of STORAGE_KEYS) {
    const value = storage.getItem(key);
    if (!value) continue;

    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every(isProfilePreset)) {
        return parsed;
      }
    } catch {
      // Try the legacy key before treating the local cache as empty.
    }
  }

  return [];
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
