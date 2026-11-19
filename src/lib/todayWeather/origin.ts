import { mapCities } from "./mapProjection";
import { PREFECTURES } from "./prefectures";

export type Origin = {
  lat: number;
  lon: number;
  name: string;
  slug: string;
  code?: number;
};
const slugs = [
  "sapporo",
  "sendai",
  "niigata",
  "tokyo",
  "nagoya",
  "osaka",
  "hiroshima",
  "kochi",
  "fukuoka",
  "naha",
];
export const CITY_ORIGINS: Origin[] = [
  1, 4, 15, 13, 23, 27, 34, 39, 40, 47,
].map((code, i) => ({
  ...mapCities[code],
  code,
  slug: slugs[i],
  name: PREFECTURES.find((p) => p.code === code)!.city,
}));
export const TOKYO_ORIGIN = CITY_ORIGINS[3];
export function cityOrigin(from?: string) {
  return CITY_ORIGINS.find(
    (city) =>
      city.slug === from || city.name === from || String(city.code) === from,
  );
}
export function resolveOrigin(
  from?: string,
  registered?: Origin | null,
): Origin {
  return cityOrigin(from) ?? registered ?? TOKYO_ORIGIN;
}
export function validCoordinates(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}
export function coordinateOrigin(
  lat: string | null,
  lon: string | null,
): Origin | undefined {
  if (!lat?.trim() || !lon?.trim()) return undefined;
  const latitude = Number(lat),
    longitude = Number(lon);
  if (!validCoordinates(latitude, longitude)) return undefined;
  return {
    lat: latitude,
    lon: longitude,
    name: "指定地点",
    slug: "coordinates",
  };
}
export function arbitrageHref(origin: Origin) {
  return `/relocation/arbitrage?baseLat=${origin.lat}&baseLon=${origin.lon}`;
}
