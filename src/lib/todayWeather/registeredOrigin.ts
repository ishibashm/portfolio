import { findActiveProfile } from "@/lib/activeProfile";
import type { ProfilePreset } from "@/lib/profilePresetSync";
import { cookies } from "next/headers";
import { validCoordinates, type Origin } from "./origin";

/** 表示用に読むだけ。都市リンクでプロフィールの出発地を更新しない。 */
export async function getRegisteredProfile(): Promise<{
  origin: Origin | null;
  birthDate?: string;
} | null> {
  try {
    const jar = await cookies();
    if (
      !jar
        .getAll()
        .some(
          ({ name }) => name.startsWith("sb-") || name === "dev_bypass_user",
        )
    )
      return null;
    const { getAuthUser, findUserConfig } = await import("@/lib/userConfig");
    const user = await getAuthUser();
    if (!user) return null;
    const config = await findUserConfig(user);
    if (config?.personal_cloud_opt_in !== true) return null;
    const presets = Array.isArray(config.presets)
      ? config.presets.filter(
          (p): p is typeof p & ProfilePreset =>
            !!p &&
            typeof p === "object" &&
            !Array.isArray(p) &&
            typeof p.birthDate === "string" &&
            typeof p.baseLat === "number" &&
            typeof p.baseLon === "number",
        )
      : [];
    const active = findActiveProfile(presets, {
      birth_date: config.birth_date,
    });
    const birthDate = active?.birthDate || config.birth_date || undefined;
    const lat = config?.base_lat,
      lon = config?.base_lon;
    if (!validCoordinates(lat, lon) || typeof lon !== "number")
      return { origin: null, birthDate };
    const settings = config?.metaphysical_config;
    const label =
      settings &&
      typeof settings === "object" &&
      !Array.isArray(settings) &&
      typeof settings.base_label === "string"
        ? settings.base_label
        : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    return {
      birthDate,
      origin: {
        lat,
        lon,
        name: label,
        slug: "registered",
      },
    };
  } catch {
    return null;
  }
}

/** 同意のない個人情報は登録地にも使用しない。 */
export async function getRegisteredOrigin(): Promise<Origin | null> {
  return (await getRegisteredProfile())?.origin ?? null;
}
