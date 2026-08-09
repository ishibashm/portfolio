/**
 * 従量課金の外部 API を叩くルート用の歯止め。
 *
 * このサイトの /api は middleware で認証の外に置いてある（ログイン不要で
 * 動くのが仕様）。つまり課金の伴うルートは、誰でも叩ける前提で守るしかない。
 * 守り方は 3 枚重ねにしてある。
 *
 *   1. TokenBucket  … 1 つの相手からの連打を止める
 *   2. DailyCounter … 1 日の呼び出し総数に天井を作る（最後の砦。失敗時は閉じる）
 *   3. TtlCache     … 同じ問い合わせで二度払わない
 *
 * すべてプロセス内メモリで持つ。Cloud Run は max-instances=2 なので、
 * 実効の上限は「ここで設定した値 × 2」になる。インスタンスが再起動すれば
 * カウンタも 0 に戻る。厳密な会計ではなく、青天井を潰すための歯止めとして
 * 設計してある。正確な上限が要るようになったら Anthropic 側の
 * spend limit を併用すること（そちらが本当の最後の砦）。
 *
 * 時刻は引数で受け取る。テストから決定的に動かすため。
 */

/** 1 日の境目は日本時間で切る。深夜に使う人のほうが多い */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDayKey(nowMs: number): string {
  return new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 相手ごとのトークンバケツ。capacity 個まで貯められ、refillPerMs の速さで戻る。
 *
 * キーは無制限には持たない。IP を変えながらの連打で Map が太ると、
 * 512Mi のインスタンスでは連打そのものより先にメモリで倒れる。
 */
export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly maxKeys = 5000,
  ) {}

  /** 1 つ消費できたか。false なら拒否する */
  take(key: string, nowMs: number): boolean {
    const prev = this.buckets.get(key);
    let tokens = this.capacity;
    if (prev) {
      tokens = Math.min(
        this.capacity,
        prev.tokens + (nowMs - prev.at) * this.refillPerMs,
      );
    }
    if (tokens < 1) {
      // 拒否したときも時刻は進めておく。そうしないと回復が止まる。
      this.buckets.set(key, { tokens, at: nowMs });
      return false;
    }
    // Map は挿入順。古いキーから落とせば実質 LRU になる。
    this.buckets.delete(key);
    if (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (!oldest.done) this.buckets.delete(oldest.value);
    }
    this.buckets.set(key, { tokens: tokens - 1, at: nowMs });
    return true;
  }

  /** 回復までのおおよその秒数。Retry-After に使う */
  retryAfterSec(key: string, nowMs: number): number {
    const prev = this.buckets.get(key);
    if (!prev) return 0;
    const tokens = Math.min(
      this.capacity,
      prev.tokens + (nowMs - prev.at) * this.refillPerMs,
    );
    if (tokens >= 1) return 0;
    return Math.ceil((1 - tokens) / this.refillPerMs / 1000);
  }

  get size(): number {
    return this.buckets.size;
  }
}

/** 1 日あたりの呼び出し総数。日付が変わったら 0 に戻る */
export class DailyCounter {
  private day = "";
  private count = 0;

  constructor(private readonly limit: number) {}

  /** 上限に達していなければ 1 増やして true */
  tryConsume(nowMs: number): boolean {
    const today = jstDayKey(nowMs);
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }

  /** 上流が失敗して課金が起きなかったぶんを戻す */
  refund(nowMs: number): void {
    if (jstDayKey(nowMs) === this.day && this.count > 0) this.count -= 1;
  }

  used(nowMs: number): number {
    return jstDayKey(nowMs) === this.day ? this.count : 0;
  }
}

/** 同じ入力に二度払わないための、期限つきの小さなキャッシュ */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string, nowMs: number): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires <= nowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, nowMs: number): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expires: nowMs + this.ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * 呼び出し元の識別子。Cloud Run は x-forwarded-for の先頭に接続元を入れる。
 *
 * ヘッダは詐称できる。だからこれは「善意の利用者どうしを分ける」ための鍵で
 * あって、悪意への防壁ではない。悪意に対して効くのは DailyCounter のほう。
 */
export function clientKey(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

/**
 * 同一オリジンからの呼び出しか。
 *
 * ブラウザは別オリジンからの POST に必ず Origin を付ける。同一オリジンの
 * fetch でも POST なら付く。よって「Origin があって、かつホストが一致」を
 * 求めれば、他所のページからの呼び出しも、Origin を付けない素の
 * スクリプトも弾ける。ヘッダは詐称できるので、これも青天井を潰すための
 * 一枚目でしかない。
 */
export function isSameOrigin(req: {
  headers: Headers;
  nextUrl: { host: string };
}): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return (
      new URL(origin).host === (req.headers.get("host") ?? req.nextUrl.host)
    );
  } catch {
    return false;
  }
}
