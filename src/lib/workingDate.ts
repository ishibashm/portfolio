/**
 * 「いま検討している引っ越し日」の置き場所。
 *
 * ## なぜ要るか
 *
 * 利用者報告——「引っ越し時期を選んだのに物件を地図で探す段階になったら
 * 選んだ時期が消えていた」。
 *
 * 追うと、選んだ日は **`targetDate` をクエリに載せた特定のリンクを
 * 通ったときだけ**保存されていた。物件スキャナーはそのクエリを受け取って
 * 初めて保存側に書き、次からは保存値を読む——という作りだったので、
 *
 *   /calendar の日ごとの行 → スキャナー          日付が残る
 *   /timing の「この日でスキャナーを開く」        日付が残る
 *   /guide の手順 5「物件を方位で探す」           **今日に戻る**
 *   /calendar の CTA「物件を方位で探す」          **今日に戻る**
 *   サイドバー・ホームからスキャナー              **今日に戻る**
 *
 * となっていた。しかも /guide の手順 5 の説明文は「**決まった日付と方位で**
 * …絞り込みます」と書いてあり、案内文と実装が食い違っていた。
 *
 * 直し方は「リンクに載せる」ではなく「**選んだ時点で残す**」。日を選ぶ道具
 * （/calendar・/timing）が選択を保存すれば、その後どの経路で入っても
 * スキャナーが読み出せる。
 *
 * ## 2 つ書く理由
 *
 * 保存先が 2 つあるのは移行途中だから。スキャナーは新しい設定
 * （`tactical_config_v1`）があればそれを読み、無いときだけ旧キーに落ちる。
 * どちらか片方だけに書くと、利用者の端末の状態次第で拾えない。
 * **書く側をここ 1 つに閉じ込めて、拾えない組み合わせを作らない。**
 */

/** 旧キー。新しい設定が無い端末はこちらが読まれる。 */
const LEGACY_KEY = "arb_targetDate";
/** 新しい設定。スキャナー・移住先比較・設定バーが共有する。 */
const CONFIG_KEY = "tactical_config_v1";

/** YYYY-MM-DD か。ここを通らない値は保存しない。 */
export function isWorkingDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * 検討中の日として保存する。形が違えば**何もしない**（false を返す）。
 *
 * 壊れた値で上書きすると、次に開いたときスキャナーが日付を復元できず、
 * 黙って今日に戻る。消えたように見えるのは今回の報告と同じ症状なので、
 * 弾いて元の値を残すほうが良い。
 */
export function saveWorkingDate(date: string): boolean {
  if (!isWorkingDate(date)) return false;
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(LEGACY_KEY, date);
    let config: Record<string, unknown> = {};
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          config = parsed as Record<string, unknown>;
        }
      } catch {
        // 壊れた設定は読み捨てる。日付だけ持つ設定を作り直す
      }
    }
    config.target_date = date;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    // 保存できない端末（プライベートウィンドウ等）では諦める。
    // その場合も画面の動きは変えない
    return false;
  }
}

/** 保存されている検討中の日。無ければ null。 */
export function readWorkingDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const value = (parsed as { target_date?: unknown }).target_date;
        if (isWorkingDate(value)) return value;
      }
    }
  } catch {
    // 壊れていれば旧キーに落ちる
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    return isWorkingDate(legacy) ? legacy : null;
  } catch {
    return null;
  }
}
