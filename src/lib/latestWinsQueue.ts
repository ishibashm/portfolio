/**
 * 「走っている間に来た要求は、最新の 1 つだけ取っておいて、終わってから
 * 走らせる」列。物件検索の走査（/api/rentals/arbitrage）が読む。
 *
 * ## なぜ要るか（本番の実測、2026-09-11）
 *
 * 走査の所要時間を 72 時間ぶん読んだら（scan-timings.yml）、遅い回は
 * **全部が 1〜2 秒差の対**だった。
 *
 *     33,693 ms  10:37:07Z    32,229 ms  10:37:06Z   （同じ条件・334,118 行）
 *     29,476 ms  10:39:16Z    27,786 ms  10:39:15Z
 *     40,641 ms  03:33:32Z    39,375 ms  03:33:30Z
 *
 * ログは走査の**終了**時刻なので、同じ走査が 1〜2 秒差で 2 本、DB で同時に
 * 走っていたことになる。1 本ずつなら db-explain の 5 秒前後で済むものが、
 * 重なって 25〜40 秒に伸びていた。
 *
 * 2 本になる経路は画面側にある。頁を開くと (1) 条件の確定で 100ms 後に
 * 1 本、(2) 地図が実際の表示範囲を報告して 500ms 後にもう 1 本。出発地を
 * 変えたときも地図が動くので同じ。パンを続ければ 500ms ごとに 1 本ずつ
 * 増える。画面は古い応答を fetchSeqRef で捨てるが、**DB は捨てられた
 * ぶんも最後まで走る。**
 *
 * ## 何をするか
 *
 * - 空いていれば、すぐ走らせる
 * - 走っている間に来た要求は、**最新の 1 つだけ**を取っておく（途中の
 *   ものは捨てる。どうせ画面も捨てる）
 * - 走り終えたら、取っておいた 1 つを走らせる
 *
 * 要求は「実行するもの」を関数で受け取る。取っておいた要求を後で走らせる
 * とき、その時点の最新の条件で走るよう、呼ぶ側は関数の中で最新の実装を
 * 引く（page.tsx の runScanRef）。
 *
 * 失敗の扱いはここでは持たない。走らせた関数が投げても列は空ける。
 * 画面に何を出すかは走らせた側（fetchData の catch）の仕事。
 */
export interface LatestWinsQueue {
  /** 走らせる。空いていなければ、最新の 1 つとして取っておく。 */
  request(run: () => Promise<void>): void;
  /** いま走っているか。 */
  readonly busy: boolean;
  /** 取ってある要求があるか。 */
  readonly hasPending: boolean;
}

export function createLatestWinsQueue(): LatestWinsQueue {
  let running = false;
  let pending: (() => Promise<void>) | null = null;

  const start = (run: () => Promise<void>) => {
    running = true;
    Promise.resolve()
      .then(run)
      .catch(() => {
        /* 失敗は走らせた側が扱う。ここでは列を空けるだけ */
      })
      .then(() => {
        running = false;
        const next = pending;
        pending = null;
        if (next) start(next);
      });
  };

  return {
    request(run) {
      if (running) {
        pending = run;
        return;
      }
      start(run);
    },
    get busy() {
      return running;
    },
    get hasPending() {
      return pending !== null;
    },
  };
}
