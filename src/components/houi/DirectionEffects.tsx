import {
  directionEffectSentence,
  elementRelationSentence,
  STAR_MEANINGS,
} from "@/lib/kigakuMeanings";
import type { DirectionVerdict } from "@/lib/kigakuContent";

/**
 * その盤で「どの方位に何が期待できるか」を書く。
 *
 * 記事ページは本命星 × 年 × 月で 243 ページあり、実測では文章の類似度が
 * 平均 93〜95%（最大 98%）だった。判定表は載っていても「その方位を取ると
 * 何が起きるのか」が無く、どのページも同じ説明で終わっていた。
 *
 * 回座している星は 8 方位 × 9 星の組み合わせでページごとに違うので、
 * ここが実際の差になる。読み手にとっても、方位を選ぶ理由がここで初めて分かる。
 */
export function DirectionEffects({
  verdicts,
  periodLabel,
  personalStar,
}: {
  verdicts: DirectionVerdict[];
  periodLabel: string;
  /** 本命星。回座する星との五行の相性を出すのに使う。 */
  personalStar: number;
}) {
  const good = verdicts.filter((v) => v.kind === "good" && v.star !== null);
  // 重い凶（五黄殺・暗剣殺・破）を優先して、多すぎない数だけ挙げる
  const bad = verdicts.filter((v) => v.kind === "bad" && v.star !== null);

  if (good.length === 0 && bad.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
        この方位を取ると何が期待できるか
      </h2>
      <p className="mt-4 text-xs leading-relaxed text-slate-600">
        九星気学では、方位そのものよりも
        <b>その方位に回座している星</b>
        が働きの中身を決めると考えます。同じ「東」でも、回座する星が変われば
        起きることが変わります。{periodLabel}の並びは次のとおりです。
      </p>

      {good.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-bold text-emerald-800">
            吉方位として使える方位
          </h3>
          {good.map((v) => (
            <div
              key={v.direction}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
            >
              <p className="text-xs leading-relaxed text-emerald-950">
                {directionEffectSentence(v.direction, v.star, "good")}
              </p>
              {v.star !== null && (
                <p className="mt-2 text-[11px] leading-relaxed text-emerald-800">
                  {elementRelationSentence(personalStar, v.star)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {bad.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-bold text-rose-800">
            避けたい方位と、その理由
          </h3>
          {bad.map((v) => (
            <div
              key={v.direction}
              className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4"
            >
              <p className="text-xs font-bold text-rose-900">{v.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-950">
                {directionEffectSentence(v.direction, v.star, "bad")}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
        ここに書いた働きは、後天定位盤における各星の象意にもとづく古典的な
        考え方です。方位が持つ意味と、そこに回座する星の意味が一致するとき
        （たとえば
        {STAR_MEANINGS[1].home === "N" ? "北に一白水星" : "定位と同じ配置"}
        ）は、同じ象意が重なるぶん働きが強く出るとされます。
      </p>
    </section>
  );
}
