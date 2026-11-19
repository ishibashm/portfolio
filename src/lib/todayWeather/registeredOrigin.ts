import { cookies } from "next/headers";
import { validCoordinates, type Origin } from "./origin";

/** 表示用に読むだけ。都市リンクでプロフィールの出発地を更新しない。 */
export async function getRegisteredOrigin(): Promise<Origin | null> {
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
    const lat = config?.base_lat,
      lon = config?.base_lon;
    if (!validCoordinates(lat, lon) || typeof lon !== "number") return null;
    const settings = config?.metaphysical_config;
    const label =
      settings &&
      typeof settings === "object" &&
      !Array.isArray(settings) &&
      typeof settings.base_label === "string"
        ? settings.base_label
        : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    return {
      lat,
      lon,
      name: label,
      slug: "registered",
    };
  } catch {
    return null;
  }
}
