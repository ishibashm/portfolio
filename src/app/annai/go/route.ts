import { cookies } from "next/headers";
import {
  ANNAI_MOVE_COOKIE,
  chainDateSchema,
  encodeMoveCookie,
  guideCodeSchema,
  guideMunicipalitySchema,
  guidePeriodSchema,
  parseMoveCookie,
  readCookieFromHeader,
} from "@/lib/guide/guideForm";

export const runtime = "nodejs";

/** フォーム本文の最大サイズ（4KB）。 */
const MAX_FORM_BODY_BYTES = 4096;

/** リダイレクト先は固定の相対パスのみとし、入力値は一切含めない。 */
const REDIRECT_CLEAR = "/annai";
const REDIRECT_ANSWER = "/annai?kind=move&view=answer";
const REDIRECT_ERROR = "/annai?kind=move&error=1";

function buildMoveCookieHeader(value: string, maxAge: number): string {
  const attributes = [
    `${ANNAI_MOVE_COOKIE}=${value}`,
    "Path=/annai",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function redirect303(
  location:
    | typeof REDIRECT_CLEAR
    | typeof REDIRECT_ANSWER
    | typeof REDIRECT_ERROR,
  setCookie?: string,
): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
  });
  if (setCookie) {
    headers.set("Set-Cookie", setCookie);
  }
  return new Response(null, {
    status: 303,
    headers,
  });
}

/**
 * 本文を上限つきで読み、フォームとして解釈する。上限を超えたら null。
 * clone して二度読むと、超過時に片方の枝が止まったままになるので、一度だけ読む。
 */
async function readFormWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<URLSearchParams | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > maxBytes) return null;
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded"))
    return null;
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

async function readExistingMoveCookieRaw(
  request: Request,
): Promise<string | undefined> {
  const fromHeader = readCookieFromHeader(
    request.headers.get("cookie"),
    ANNAI_MOVE_COOKIE,
  );
  if (fromHeader !== undefined) {
    return fromHeader;
  }
  try {
    const store = await cookies();
    return store.get(ANNAI_MOVE_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

function readFormField(
  formData: URLSearchParams,
  key: string,
): string | undefined {
  return formData.get(key) ?? undefined;
}

/**
 * 案内役（/annai）の引越し方位・日取りフォームを受け取る POST ハンドラ。
 * 生年月日や出発地を URL クエリに残さず、HttpOnly Cookie に入れて固定パスへ 303 リダイレクトする。
 */
export async function POST(request: Request): Promise<Response> {
  const formData = await readFormWithinLimit(request, MAX_FORM_BODY_BYTES);
  if (!formData) {
    return redirect303(REDIRECT_ERROR);
  }

  const action = readFormField(formData, "action");
  if (action === "clear") {
    const clearCookie = buildMoveCookieHeader("", 0);
    return redirect303(REDIRECT_CLEAR, clearCookie);
  }

  const rawB = readFormField(formData, "b")?.trim();
  let targetB = rawB && rawB.length > 0 ? rawB : undefined;
  if (targetB === undefined) {
    const existingRaw = await readExistingMoveCookieRaw(request);
    const existing = parseMoveCookie(existingRaw);
    targetB = existing?.b;
  }

  const rawM = readFormField(formData, "m");
  const rawC = readFormField(formData, "c")?.trim();
  const rawP = readFormField(formData, "p")?.trim();

  const birthResult = chainDateSchema.safeParse(targetB);
  const muniResult = guideMunicipalitySchema.safeParse(rawM);
  const codeResult =
    rawC === undefined || rawC === ""
      ? { success: true as const, data: undefined }
      : guideCodeSchema.safeParse(rawC);
  const periodResult =
    rawP === undefined || rawP === ""
      ? { success: true as const, data: 30 as const }
      : guidePeriodSchema.safeParse(rawP);

  if (
    !birthResult.success ||
    !muniResult.success ||
    !codeResult.success ||
    !periodResult.success
  ) {
    return redirect303(REDIRECT_ERROR);
  }

  const encoded = encodeMoveCookie({
    b: birthResult.data,
    m: muniResult.data,
    ...(codeResult.data ? { c: codeResult.data } : {}),
    p: periodResult.data,
  });

  const setCookie = buildMoveCookieHeader(encoded, 1800);
  return redirect303(REDIRECT_ANSWER, setCookie);
}
