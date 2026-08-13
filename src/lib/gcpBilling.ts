import { BigQuery, type BigQueryOptions } from "@google-cloud/bigquery";
import { toLogMessage } from "@/lib/errorMessage";

type BillingEnv = Record<string, string | undefined>;

interface BillingQueryOptions {
  query: string;
  location: string;
  params: {
    invoiceMonth: string;
    targetProjectId: string;
  };
}

export type BillingQueryRunner = (
  options: BillingQueryOptions,
) => Promise<unknown[]>;

interface BillingServiceCost {
  service: string;
  amount: number;
}

export interface GcpBillingCost {
  status: "ok" | "unconfigured" | "error";
  invoiceMonth: string;
  currency: string | null;
  total: number | null;
  services: BillingServiceCost[];
  message: string | null;
}

const TABLE_NAME =
  /^[A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z0-9_]+$/;

function invoiceMonthInJapan(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}${month}`;
}

function amountOf(value: unknown): number | null {
  const raw =
    typeof value === "object" && value !== null && "value" in value
      ? (value as { value: unknown }).value
      : value;
  const amount = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

function emptyResult(
  status: "unconfigured" | "error",
  invoiceMonth: string,
  message: string,
): GcpBillingCost {
  return {
    status,
    invoiceMonth,
    currency: null,
    total: null,
    services: [],
    message,
  };
}

function credentialsFromEnv(
  value: string | undefined,
): BigQueryOptions["credentials"] | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (
    parsed.type !== "service_account" ||
    typeof parsed.client_email !== "string" ||
    !parsed.client_email.endsWith(".gserviceaccount.com") ||
    typeof parsed.private_key !== "string" ||
    !parsed.private_key.includes("BEGIN PRIVATE KEY")
  ) {
    throw new Error("サービスアカウント JSON の形式が正しくありません。");
  }
  return parsed as BigQueryOptions["credentials"];
}

function billingQuery(table: string): string {
  return `
    SELECT
      currency,
      service.description AS service,
      ROUND(SUM(
        cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) credit), 0)
      ), 6) AS amount
    FROM \`${table}\`
    WHERE invoice.month = @invoiceMonth
      AND project.id = @targetProjectId
    GROUP BY currency, service
    ORDER BY amount DESC`;
}

/**
 * Cloud Billing Export の Standard usage cost テーブルから当月実額を読む。
 *
 * Cloud Billing API は請求先の管理用で、利用額そのものは返さない。実額は
 * BigQuery export の cost と credits を合算して読む。設定が無い環境では
 * 外部通信せず「未設定」を返し、管理画面全体は止めない。
 */
export async function loadGcpBillingCost(
  env: BillingEnv = process.env,
  injectedQuery?: BillingQueryRunner,
  now = new Date(),
): Promise<GcpBillingCost> {
  const invoiceMonth = invoiceMonthInJapan(now);
  const table = env.GCP_BILLING_EXPORT_TABLE?.trim();
  const targetProjectId = (
    env.GCP_BILLING_TARGET_PROJECT_ID ?? env.GCP_PROJECT_ID
  )?.trim();

  if (!table || !targetProjectId) {
    return emptyResult(
      "unconfigured",
      invoiceMonth,
      "Billing Export のテーブル名と対象プロジェクトが未設定です。",
    );
  }
  if (!TABLE_NAME.test(table)) {
    return emptyResult(
      "error",
      invoiceMonth,
      "Billing Export のテーブル名が正しくありません。",
    );
  }

  try {
    const location = env.GCP_BILLING_LOCATION?.trim() || "US";
    const queryProjectId =
      env.GCP_BILLING_QUERY_PROJECT_ID?.trim() || targetProjectId;
    const query = injectedQuery
      ? injectedQuery
      : async (options: BillingQueryOptions) => {
          const client = new BigQuery({
            projectId: queryProjectId,
            credentials: credentialsFromEnv(
              env.GCP_BILLING_SERVICE_ACCOUNT_JSON,
            ),
          });
          const [rows] = await client.query(options);
          return rows;
        };
    const rows = await query({
      query: billingQuery(table),
      location,
      params: { invoiceMonth, targetProjectId },
    });

    const parsed = rows.flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const row = raw as Record<string, unknown>;
      const amount = amountOf(row.amount);
      if (
        typeof row.currency !== "string" ||
        typeof row.service !== "string" ||
        amount === null
      ) {
        return [];
      }
      return [{ currency: row.currency, service: row.service, amount }];
    });
    const currencies = new Set(parsed.map((row) => row.currency));
    if (currencies.size > 1) {
      return emptyResult(
        "error",
        invoiceMonth,
        "複数の通貨が混在しているため合計を出せません。",
      );
    }

    return {
      status: "ok",
      invoiceMonth,
      currency: parsed[0]?.currency ?? null,
      total: parsed.reduce((sum, row) => sum + row.amount, 0),
      services: parsed.map(({ service, amount }) => ({ service, amount })),
      message: null,
    };
  } catch (error) {
    console.error("GCP 請求実額の取得に失敗:", toLogMessage(error));
    return emptyResult(
      "error",
      invoiceMonth,
      "GCP 請求実額を取得できませんでした。設定と権限を確認してください。",
    );
  }
}
