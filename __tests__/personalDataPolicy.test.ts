import { describe, expect, it } from "vitest";
import {
  gatePersonalData,
  PERSONAL_FIELDS,
  RETIRED_HEALTH_FIELDS,
} from "@/lib/personalDataPolicy";

describe("個人情報の書き込み同意", () => {
  const personal = Object.fromEntries(
    PERSONAL_FIELDS.map((key) => [key, "fictitious"]),
  );
  it("既定は全て落とし、元のオブジェクトを変更しない", () => {
    const result = gatePersonalData({ ...personal, action_intent: "REST" });
    expect(result.data).toEqual({ action_intent: "REST" });
    expect(result.ignoredPersonalFields).toEqual(PERSONAL_FIELDS);
    expect(Object.keys(personal)).toEqual(PERSONAL_FIELDS);
  });
  it("保存済み同意または同じリクエストの true だけで許可する", () => {
    expect(gatePersonalData(personal, true).data).toEqual(personal);
    expect(
      gatePersonalData({ ...personal, personal_cloud_opt_in: true }).allowed,
    ).toBe(true);
    expect(
      gatePersonalData({ ...personal, personal_cloud_opt_in: "true" }).allowed,
    ).toBe(false);
  });
  it("オフにするリクエストでは、既存同意があっても書かない", () => {
    const result = gatePersonalData(
      { ...personal, personal_cloud_opt_in: false },
      true,
    );
    expect(result.data).toEqual({ personal_cloud_opt_in: false });
  });
  it("健康基準値と raw 値は同意があっても新規保存しない", () => {
    const result = gatePersonalData(
      Object.fromEntries(RETIRED_HEALTH_FIELDS.map((key) => [key, 42])),
      true,
    );
    expect(result.data).toEqual({});
    expect(result.ignoredPersonalFields).toEqual(RETIRED_HEALTH_FIELDS);
  });
});
