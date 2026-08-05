export function getBaseAstrologyStatus(status: string): string {
  return status.split("+")[0]?.trim() ?? "";
}

const POSITIVE_ASTROLOGY_FLAGS = new Set([
  "JUPITER_ASC",
  "JUPITER_MC",
  "VENUS_ASC",
  "VENUS_MC",
  "LUNAR_BOOST",
]);

export function isRecommendedRelocationStatus(status: string): boolean {
  if (!["OPTIMAL", "SAFE"].includes(getBaseAstrologyStatus(status))) {
    return false;
  }

  const flags = status
    .split("+")
    .slice(1)
    .join("+")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);
  return flags.every((flag) => POSITIVE_ASTROLOGY_FLAGS.has(flag));
}

export function formatShortStayBaseMessage(activeBaseName: string): string {
  return `※滞在が75日未満のため、この移動後の拠点（太極）は「${activeBaseName}」のまま動きません。`;
}
