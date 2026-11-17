/** 明示した保存同意だけを採用し、読み込みや既存値の削除とは切り離す。 */
export const PERSONAL_FIELDS = [
  "birth_date",
  "birth_time",
  "birth_lat",
  "birth_lon",
  "base_lat",
  "base_lon",
  "presets",
];
export const RETIRED_HEALTH_FIELDS = [
  "baseline_hrv_mean",
  "baseline_hrv_std",
  "baseline_gsr_mean",
  "baseline_gsr_std",
  "baselineHrvMean",
  "baselineHrvStd",
  "baselineGsrMean",
  "baselineGsrStd",
  "hrv",
  "gsr",
];

export function personalCloudAllowed(
  stored: boolean,
  requested: unknown,
): boolean {
  return typeof requested === "boolean" ? requested : stored;
}

export function gatePersonalData<T>(
  body: Record<string, T>,
  storedOptIn = false,
) {
  const data = { ...body };
  const allowed = personalCloudAllowed(storedOptIn, body.personal_cloud_opt_in);
  const ignoredPersonalFields: string[] = [];
  for (const key of [
    ...RETIRED_HEALTH_FIELDS,
    ...(!allowed ? PERSONAL_FIELDS : []),
  ]) {
    if (Object.hasOwn(data, key)) {
      ignoredPersonalFields.push(key);
      delete data[key];
    }
  }
  return { data, ignoredPersonalFields, allowed };
}
