import { toLogMessage } from "@/lib/errorMessage";

/**
 * Search Console の読み取り。
 *
 * ## 認証について
 *
 * ライブラリを入れず、**メタデータサーバーから直接トークンを取る。**
 * Cloud Run のコンテナは
 *
 *   http://metadata.google.internal/computeMetadata/v1/
 *     instance/service-accounts/default/token
 *
 * を叩くと、そのサービスで動いているサービスアカウントのアクセストークンを
 * 返す。鍵ファイルも GitHub Secrets も要らない。
 *
 * deploy.yml の `gcloud run deploy` は --service-account を指定していないので、
 * 動いている本人は**既定の Compute Engine サービスアカウント**
 * （116694017128-compute@developer.gserviceaccount.com）。この身元を
 * Search Console 側のユーザーに足してある。
 *
 * **手元では動かない。**メタデータサーバーはクラウド上にしか無いので、
 * ローカルや CI では notOnCloudRun を返して終わる。動作の確認は本番で
 * 管理者の口（/api/admin/search-console）を開いて行う。
 *
 * ## 権限について
 *
 * Search Console の権限は GCP のロールとは別物で、画面から足すしかない
 * （API が無い）。読み取りだけなので scope は webmasters.readonly。
 */

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const SITES_URL = "https://searchconsole.googleapis.com/webmasters/v3/sites";

/** メタデータサーバーの応答。必要な枝だけ写す。 */
interface MetadataToken {
  access_token?: string;
  expires_in?: number;
}

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export type SearchConsoleProbe =
  | { ok: true; sites: SearchConsoleSite[] }
  | {
      ok: false;
      reason: "notOnCloudRun" | "noToken" | "apiError";
      detail: string;
    };

/**
 * アクセストークンを取る。クラウド上でなければ null。
 *
 * timeout を短くしてあるのは、メタデータサーバーが無い環境では
 * **繋がらないまま待たされる**ため。手元で開いたときに固まらせない。
 */
export async function fetchAccessToken(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${METADATA_TOKEN_URL}?scopes=${SCOPE}`, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as MetadataToken;
    return body.access_token ?? null;
  } catch (e) {
    console.warn(
      "メタデータサーバーからトークンを取れません:",
      toLogMessage(e),
    );
    return null;
  }
}

/**
 * 見えているプロパティの一覧。**権限が通っているかの確認そのもの。**
 *
 * サービスアカウントを Search Console に足せていれば、ここに
 * cloud-palette.com が出る。足せていなければ空で返る（403 ではない）ので、
 * 「繋がったが見えない」と「そもそも繋がらない」を区別できるようにする。
 */
export async function probeSearchConsole(
  fetchImpl: typeof fetch = fetch,
): Promise<SearchConsoleProbe> {
  const token = await fetchAccessToken(fetchImpl);
  if (!token) {
    return {
      ok: false,
      reason: "notOnCloudRun",
      detail:
        "メタデータサーバーからトークンを取れませんでした。クラウド上で動いていないか、サービスアカウントが割り当たっていません。",
    };
  }

  try {
    const res = await fetchImpl(SITES_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        reason: "apiError",
        detail: `${res.status} ${text.slice(0, 400)}`,
      };
    }

    const body = (await res.json()) as { siteEntry?: SearchConsoleSite[] };
    return { ok: true, sites: body.siteEntry ?? [] };
  } catch (e) {
    return { ok: false, reason: "apiError", detail: toLogMessage(e) };
  }
}
