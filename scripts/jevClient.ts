/**
 * Jev（TypeSafe System One）を呼ぶ部品。採点のスクリプトが共通で使う。
 *
 * 最初は内部リンクの採点（score_link_candidates）の中に直に書いていたが、
 * 記事の題と本文のズレの採点（score_title_alignment）でも同じものが要る
 * ので切り出した。**口の選び方・再試行・途中で落ちたときの止め方**を
 * 2 か所に写すと、片方だけ直して食い違う（#1435 で直した「途中で落ちると
 * 採点済みも消える」がまさにそれで、写しがあれば写しの側に残る）。
 *
 * 問いの組み立てと答えの読み方は、それぞれのスクリプトの側に置く。
 * 答えの形（`answers.<id>.noul`）を読むのは `linkCandidates.parseAnswer`。
 */

/** 入力 100 万トークンあたりの値段（USD。2026-09 の公表値。出力は無料）。 */
export const PRICE_PER_MTOK_USD = 0.042;

/**
 * どの口から Jev を呼ぶか。本文の形は同じで、URL・モデル名・鍵が違う。
 *
 * OpenRouter の chat/completions は Jev を受け付けない（decisions model と
 * して弾かれる）。必ず decisions の口を使う。
 */
export const PROVIDERS = {
  typesafe: {
    baseEnv: "TYPESAFE_BASE_URL",
    base: "https://api.typesafe.ai",
    path: "/v1/systemone",
    model: "jev-latest",
    keyName: "TYPESAFE_API_KEY",
  },
  openrouter: {
    baseEnv: "OPENROUTER_BASE_URL",
    base: "https://openrouter.ai/api",
    path: "/alpha/decisions",
    model: "typesafe/jev-1.13",
    keyName: "OPENROUTER_API_KEY",
  },
} as const;
export type ProviderName = keyof typeof PROVIDERS;

export interface Provider {
  name: ProviderName;
  endpoint: string;
  model: string;
  /** 無ければ undefined。呼ぶ側は dry-run に倒す（外へは何も送らない）。 */
  key: string | undefined;
}

/**
 * 口を決める。指定が無ければ鍵のある方（両方あれば TypeSafe 直）。
 * 知らない名前は例外（黙って別の口へ行かない）。
 *
 * 環境変数は**ここで読む**（import した時点では読まない）。呼ぶ側は
 * dotenv.config() を import の後に呼ぶので、import 時に読むと .env の
 * 鍵と URL が入らない。
 */
export function resolveProvider(wanted: string | undefined): Provider {
  if (wanted !== undefined && !(wanted in PROVIDERS)) {
    throw new Error(`--provider は typesafe か openrouter（${wanted} は不明）`);
  }
  const name: ProviderName =
    (wanted as ProviderName | undefined) ??
    (process.env.TYPESAFE_API_KEY ? "typesafe" : "openrouter");
  const p = PROVIDERS[name];
  return {
    name,
    endpoint: `${process.env[p.baseEnv] ?? p.base}${p.path}`,
    model: p.model,
    key: process.env[p.keyName],
  };
}

/**
 * 1 回呼ぶ。429 と 5xx は 2 回まで待って再試行し、それ以外（402 の
 * 残高切れ、401 の鍵違いなど）は**その場で例外**にする。再試行しても
 * 答えが変わらない誤りを繰り返すと、残高だけが減る。
 */
export async function callJev(
  provider: Provider,
  body: unknown,
): Promise<unknown> {
  if (!provider.key) throw new Error(`${provider.name} の鍵が無い`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.key}`,
        "x-api-key": provider.key,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }
  throw new Error("Jev が 429/5xx を返し続けた");
}

/**
 * 並べて回す。**途中で落ちても、そこまでの結果は捨てない。**
 *
 * run #4（2026-09-19。全宛先 897 段落）は 700 段落まで採点したところで
 * OpenRouter が 402（残高切れ）を返し、例外がそのまま main を抜けて
 * TSV も表も出なかった。約 $0.2 ぶんの答えが全部消えた（#1435）。
 *
 * 1 本の worker が例外を受けたら、他の worker も次を取らずに止まる。
 * 呼ぶ側は `fatal` を見て、結果を書き出してから失敗で終えること
 * （緑にしない）。
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R[]>,
  onProgress?: (done: number, planned: number) => void,
): Promise<{
  results: R[];
  done: number;
  planned: number;
  fatal: Error | null;
}> {
  const queue = [...items];
  const planned = queue.length;
  const results: R[] = [];
  let done = 0;
  // 閉包の中で代入するので、tsc の絞り込みが効かない形（入れ物）で持つ
  const halt: { fatal: Error | null } = { fatal: null };
  const worker = async () => {
    while (queue.length && !halt.fatal) {
      const item = queue.shift()!;
      try {
        results.push(...(await fn(item)));
      } catch (e) {
        halt.fatal ??= e instanceof Error ? e : new Error(String(e));
        return;
      }
      done++;
      onProgress?.(done, planned);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { results, done, planned, fatal: halt.fatal };
}
