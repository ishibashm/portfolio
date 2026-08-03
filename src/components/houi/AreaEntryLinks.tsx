import Link from "next/link";
import { AREAS, topAreasByPref } from "@/lib/areaContent";

/**
 * 九星気学の記事（年盤・月盤）から、エリア別のページへ入るための導線。
 *
 * 記事側は「北東が吉」までしか言えない。読み手が次に知りたいのは
 * 「では北東に何があって、いくらか」だが、方位は出発地からの向きで決まるので
 * 記事だけでは答えが出ない。出発地を選んでもらってエリアページへ送る。
 *
 * この導線が無い間、年盤 27 ページと月盤 216 ページからエリアページ 220 枚への
 * リンクが 1 本も無く、/houi/area の一覧だけが唯一の入口だった。
 */
export function AreaEntryLinks({ heading }: { heading: string }) {
  const byPref = topAreasByPref(3);

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
        {heading}
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        方位は<b>今住んでいる場所から見た向き</b>で決まるため、
        同じ吉方位でも出発地が違えば行き先は変わります。
        いま住んでいる市区町村を選ぶと、そこから見た八方位それぞれに
        どの街があり家賃相場がいくらかを確認できます。
      </p>

      <div className="mt-5 space-y-3">
        {byPref.map(([pref, list]) => (
          <div key={pref} className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs font-bold text-slate-500 w-16 shrink-0">
              {pref}
            </span>
            {list.map((a) => (
              <Link
                key={a.code}
                href={`/houi/area/${a.code}`}
                className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
              >
                {a.city}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <Link
        href="/houi/area"
        className="mt-5 inline-flex text-xs font-semibold text-rose-600 underline hover:text-rose-700"
      >
        すべての市区町村から選ぶ（{AREAS.length}エリア）
      </Link>
    </section>
  );
}
