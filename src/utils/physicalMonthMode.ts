import type { getPhysicalMonthStar } from "./ephemerisEngine";

type PhysicalMonthMode = NonNullable<
  Parameters<typeof getPhysicalMonthStar>[1]
>;

/** 不正値は未指定と同じ独立月盤へ。暦エンジンは型だけを参照する。 */
export function parsePhysicalMonthMode(
  value: string | null | undefined,
): PhysicalMonthMode {
  return value === "coupled" || value === "independent" ? value : "independent";
}
