/**
 * 積み上げ棒グラフの構成比を、合計がちょうど 100 になる整数にする。
 *
 * 発端: 時期分析の「方位ごとの段階の割合」で、横軸の目盛りが
 * `100.100000000000019%` と表示されていた（利用者報告）。
 *
 * 段階ごとに `(count / total * 100).toFixed(1)` してから積み上げていたので、
 * 6 段階ぶんの丸め誤差が足し合わさって合計が 100.1 になっていた。
 * Recharts は `domain={[0, 100]}` を渡しても、データがそれを超えると
 * 軸を最大値まで伸ばす。伸ばした先が 100.1 で、しかも 0.1 刻みの値を
 * 足した二進小数なので `100.100000000000019` という桁が出ていた。
 *
 * 丸めてから足すのをやめ、**最大剰余法**で整数に配り直す。
 * 各段階は本来の割合との差が 1 未満に収まり、合計は必ず 100 になる。
 * 「割合なのに足して 100 にならない」も同時に消える。
 */

/**
 * 件数を、合計 100 の整数の百分率にする。
 *
 * 全部 0（走査結果が空）のときは全部 0 を返す。100 に足りないが、
 * 「0 件を 100% に配る」よりそのほうが正しい。
 */
export function toPercentStack<K extends string>(
  counts: Record<K, number>,
  keys: readonly K[],
): Record<K, number> {
  const out = {} as Record<K, number>;
  const total = keys.reduce((sum, k) => sum + (counts[k] || 0), 0);
  if (total <= 0) {
    for (const k of keys) out[k] = 0;
    return out;
  }

  // 端数の大きい順に 1 ずつ配る。同じ端数なら keys の並び順で先を優先し、
  // 同じ入力からは必ず同じ結果が出るようにする。
  const exact = keys.map((k, index) => {
    const value = ((counts[k] || 0) / total) * 100;
    const floor = Math.floor(value);
    return { k, index, floor, fraction: value - floor };
  });

  let remainder = 100 - exact.reduce((sum, e) => sum + e.floor, 0);
  const order = [...exact].sort(
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  const bonus = new Set<number>();
  for (const e of order) {
    if (remainder <= 0) break;
    bonus.add(e.index);
    remainder--;
  }

  for (const e of exact) out[e.k] = e.floor + (bonus.has(e.index) ? 1 : 0);
  return out;
}
