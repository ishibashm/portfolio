import { describe, expect, it, vi } from "vitest";

import { loadGcpBillingCost } from "@/lib/gcpBilling";

const configured = {
  GCP_BILLING_EXPORT_TABLE:
    "billing-project.billing.gcp_billing_export_v1_ABCDEF_123456_ABCDEF",
  GCP_BILLING_TARGET_PROJECT_ID: "portfolio-prod",
  GCP_BILLING_QUERY_PROJECT_ID: "billing-project",
  GCP_BILLING_LOCATION: "asia-northeast1",
};

describe("GCP 請求実額", () => {
  it("設定が無ければ外部通信せず未設定を返す", async () => {
    const query = vi.fn();

    const result = await loadGcpBillingCost({}, query);

    expect(result.status).toBe("unconfigured");
    expect(result.total).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("当月・対象プロジェクトのサービス別実額を合計する", async () => {
    const query = vi.fn().mockResolvedValue([
      { currency: "JPY", service: "Cloud Run", amount: 120.5 },
      { currency: "JPY", service: "Artifact Registry", amount: "29.5" },
    ]);

    const result = await loadGcpBillingCost(
      configured,
      query,
      new Date("2026-08-13T09:00:00+09:00"),
    );

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "asia-northeast1",
        jobTimeoutMs: 10_000,
        params: {
          invoiceMonth: "202608",
          targetProjectId: "portfolio-prod",
        },
      }),
    );
    expect(result).toEqual({
      status: "ok",
      invoiceMonth: "202608",
      currency: "JPY",
      total: 150,
      services: [
        { service: "Cloud Run", amount: 120.5 },
        { service: "Artifact Registry", amount: 29.5 },
      ],
      message: null,
    });
  });

  it("複数通貨が混ざると誤った合計を出さない", async () => {
    const query = vi.fn().mockResolvedValue([
      { currency: "JPY", service: "Cloud Run", amount: 100 },
      { currency: "USD", service: "Gemini", amount: 1 },
    ]);

    const result = await loadGcpBillingCost(configured, query);

    expect(result.status).toBe("error");
    expect(result.total).toBeNull();
    expect(result.message).toContain("複数の通貨");
  });

  it("解釈できない行があれば残りだけで過小な合計を出さない", async () => {
    const query = vi.fn().mockResolvedValue([
      { currency: "JPY", service: "Cloud Run", amount: 100 },
      { currency: "JPY", service: "BigQuery", amount: "not-a-number" },
    ]);

    const result = await loadGcpBillingCost(configured, query);

    expect(result.status).toBe("error");
    expect(result.total).toBeNull();
    expect(result.message).toContain("解釈できない行");
  });

  it("クエリが応答しなくても期限で取得失敗にする", async () => {
    const query = vi.fn(() => new Promise<unknown[]>(() => undefined));
    const result = await loadGcpBillingCost(
      { ...configured, GCP_BILLING_TIMEOUT_MS: "100" },
      query,
    );

    expect(result.status).toBe("error");
    expect(result.total).toBeNull();
  });

  it("テーブル名を検証し、SQL へ任意文字列を入れない", async () => {
    const query = vi.fn();
    const result = await loadGcpBillingCost(
      {
        ...configured,
        GCP_BILLING_EXPORT_TABLE: "x.y.z`; DROP TABLE users; --",
      },
      query,
    );

    expect(result.status).toBe("error");
    expect(query).not.toHaveBeenCalled();
  });
});
