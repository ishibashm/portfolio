import { Direction } from "./ephemerisEngine";

/**
 * Maps a bearing angle (0° - 360°) to a directional sector.
 * Supports standard 45-degree equal division and classical/Kigaku asymmetric 30/60 degree division.
 * Handles negative bearings and wrapping automatically.
 *
 * Classical/Kigaku Asymmetric 30/60 degree boundaries:
 * - N (North): 345° ~ 15° (30 degrees)
 * - NE (North-East): 15° ~ 75° (60 degrees)
 * - E (East): 75° ~ 105° (30 degrees)
 * - SE (South-East): 105° ~ 165° (60 degrees)
 * - S (South): 165° ~ 195° (30 degrees)
 * - SW (South-West): 195° ~ 255° (60 degrees)
 * - W (West): 255° ~ 285° (30 degrees)
 * - NW (North-West): 285° ~ 345° (60 degrees)
 */
export function getKigakuSector(bearing: number, useClassical: boolean = false): Direction {
  const b = ((bearing % 360) + 360) % 360;

  if (useClassical) {
    if (b >= 345 || b < 15) return "N";
    if (b >= 15 && b < 75) return "NE";
    if (b >= 75 && b < 105) return "E";
    if (b >= 105 && b < 165) return "SE";
    if (b >= 165 && b < 195) return "S";
    if (b >= 195 && b < 255) return "SW";
    if (b >= 255 && b < 285) return "W";
    return "NW";
  } else {
    const index = Math.floor(((b + 22.5) % 360) / 45);
    const dirs: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[index];
  }
}
