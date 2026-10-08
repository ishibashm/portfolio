import { AREA_EDITORIAL } from "@/lib/areaEditorial";

/** 解説のある出発地を先に案内する。同じ群の順序と元の配列は変えない。 */
export function editorialFirst<T extends { code: string }>(
  areas: readonly T[],
): T[] {
  return [
    ...areas.filter((area) => area.code in AREA_EDITORIAL),
    ...areas.filter((area) => !(area.code in AREA_EDITORIAL)),
  ];
}
