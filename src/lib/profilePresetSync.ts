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

async function uploadPresets(fetcher: Fetcher, presets: ProfilePreset[]) {
  const response = await fetcher("/api/profile-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets }),
  });

  return response.ok;
}

export async function loadProfilePresets(
  fetcher: Fetcher,
  storage: Storage,
): Promise<{ presets: ProfilePreset[]; cloudSynced: boolean }> {
  const localPresets = readLocalPresets(storage);

  try {
    const response = await fetcher("/api/profile-presets");
    if (!response.ok) {
      return { presets: localPresets, cloudSynced: false };
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
      cachePresets(storage, cloudPresets);
      return { presets: cloudPresets, cloudSynced: true };
    }

    if (presetsInitialized) {
      cachePresets(storage, []);
      return { presets: [], cloudSynced: true };
    }

    if (localPresets.length > 0) {
      const cloudSynced = await uploadPresets(fetcher, localPresets);
      return { presets: localPresets, cloudSynced };
    }

    cachePresets(storage, []);
    return { presets: [], cloudSynced: true };
  } catch {
    return { presets: localPresets, cloudSynced: false };
  }
}

export async function saveProfilePresets(
  presets: ProfilePreset[],
  fetcher: Fetcher,
  storage: Storage,
): Promise<{ cloudSynced: boolean }> {
  cachePresets(storage, presets);

  try {
    return { cloudSynced: await uploadPresets(fetcher, presets) };
  } catch {
    return { cloudSynced: false };
  }
}
