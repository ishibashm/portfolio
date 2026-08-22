"use client";

import { usePathname } from "next/navigation";
import { DirectionComments } from "@/components/comments/DirectionComments";
import { pageTopic, PAGE_TOPIC_KEYS } from "@/lib/comments";
import { CORE_ROUTES } from "@/lib/siteStructure";

/**
 * 中核ページの投稿欄。**置き場所を 1 か所にする。**
 *
 * 投稿欄は記事（`/houi/[year]/[star]`・`/calendar/[month]`）にしか無く、
 * 道具の画面には無かった。利用者から「コメント機能が画面に表示されて
 * いない」と報告を受けている。実際、いちばん人が居るのは道具の画面で、
 * そこに書く場所が無かった。
 *
 * 9 つの頁に 1 つずつ貼ると、貼り忘れと文言のばらつきが必ず出る
 * （実際に幅の指定が 5 通りに割れた前例がある）。**レイアウトに 1 度だけ
 * 置いて、経路から出す。**
 *
 * 出す条件は `PAGE_TOPIC_KEYS` に載っていること。この集合は
 * `CORE_ROUTES` から作られるので、**頁を足せば投稿欄も増え、消せば
 * 消える。**手で並べ直す場所が無い。
 *
 * 経路が**完全に一致**したときだけ出す。前方一致にすると
 * `/houi/2026/1` のような記事に、記事自身の投稿欄と頁の投稿欄が
 * 二重に出る。
 */

/** 経路 → 頁の名前。見出しと手掛かりの文言に使う。 */
const LABEL_BY_HREF = new Map(
  CORE_ROUTES.map((route) => [route.href, route.label]),
);

export function PageComments() {
  const pathname = usePathname();
  if (!pathname) return null;

  const key = pageTopic(pathname);
  if (!PAGE_TOPIC_KEYS.has(key)) return null;

  const label = LABEL_BY_HREF.get(pathname);
  if (!label) return null;

  return (
    /*
      幅は全画面で揃えている 1700px。ここだけ別の数字にすると、
      すぐ上の本文と左右の位置がずれる。
    */
    <div className="max-w-[1700px] w-full mx-auto px-6 pb-12">
      <DirectionComments
        topicKey={key}
        heading={`「${label}」を使った人の記録`}
        prompt="この画面で何を見て、どう決めたかを書いてください。実際に動いたあとどうだったかまで書けると、同じことで迷っている人の判断材料になります。"
      />
    </div>
  );
}
