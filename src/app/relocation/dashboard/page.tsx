import Link from "next/link";
import GuideCharacter from "@/components/guide/GuideCharacter";
import { FaqJsonLd, WebPageJsonLd } from "@/components/JsonLd";
import { buildRelocationDashboardSummary } from "@/lib/relocationDashboardSummary";
import { TOKYO_LONGITUDE } from "@/lib/todayDirections";
import { toJapanDateString } from "@/utils/japanDate";
import DashboardTool from "./DashboardTool";
import { description, path, title } from "./metadataValues";

const FAQ = [
  {
    question: "今日、誰にとっても避けたい方位はありますか？",
    answer:
      "日盤の五黄殺・暗剣殺・日破は、本命星にかかわらず避けたい方位の目安です。共通の凶方位は入力なしで「今日の要約」に表示します。本命殺などは生年月日の入力後に確認できます。",
  },
  {
    question:
      "いまの刻はいつまでで、次の刻はいつからですか？ 真太陽時とは何ですか？",
    answer: `刻は約2時間ごとで、要約の終了時刻が次の刻の開始です。東京（東経${TOKYO_LONGITUDE}度）の真太陽時で区切り、日本標準時で表示します。真太陽時は、経度と均時差で標準時を補正した太陽の時刻です。出発地を入れると刻の境目だけが出発地基準になり、年盤・月盤・日盤は日本時間の日付で決まります。`,
  },
  {
    question: "本命星が分からないときはどうすればよいですか？",
    answer:
      "この画面に生年月日を入れると本命星が分かります。「本命星と吉方位を調べる」や「吉方位」の生まれ年表でも確認できます。",
  },
  {
    question: "「今日の吉方位と時間」とはどう違いますか？",
    answer:
      "「今日の吉方位と時間」は東京基準の本命星別の早見表です。この画面では、生年月日と出発地・目的地を入れて、いま行き先の方位を使う目安を真太陽時で確認できます。",
  },
  {
    question: "目的地を入れると何が分かりますか？",
    answer:
      "出発地から目的地を見た方位を真北基準で判定し、その吉凶と今日使えるかの目安を表示します。12か月の見通しも確認できます。",
  },
  {
    question: "引っ越しの日取りは日盤だけで選べますか？",
    answer:
      "引っ越しなど長い移動では、日盤に加えて年盤・月盤も合わせて見るのが目安です。日取りはカレンダーや時期の分析で確認できます。",
  },
];

const NEXT_LINKS = [
  ["/houi/today", "今日の吉方位と時間"],
  ["/blog/todays-lucky-direction-by-hour", "今日の吉方位と時間帯はどう読むか"],
  ["/guide/honmei", "本命星と吉方位を調べる"],
];

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const headingClass = "mb-2 text-lg font-bold text-ink";

export default function DashboardPage() {
  const { date, common, branch, end } = buildRelocationDashboardSummary(
    new Date(),
  );
  const nextStart = new Date(end);
  const dayPrefix = toJapanDateString(nextStart) > date ? "翌日 " : "";

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-ink md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <WebPageJsonLd path={path} name={title} description={description} />
        <FaqJsonLd items={FAQ} />
        <h1 className="text-2xl font-bold">今日の方位と時間を確かめる</h1>
        <section className="rounded-2xl border border-theme-border bg-theme-surface p-4 sm:p-5">
          <h2 className={headingClass}>今日の要約</h2>
          <p className="text-sm text-ink-muted">
            <time dateTime={date}>{date}</time>（日本時間）
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-semibold">全員共通の日盤の凶方位</dt>
              <dd>
                {common.length
                  ? common
                      .map(({ label, reason }) => `${label}（${reason}）`)
                      .join("、")
                  : "今日の目安では、共通の凶方位はありません。"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">いまの刻</dt>
              <dd>
                {branch}の刻。次の切り替わりは
                <time dateTime={end}>
                  {dayPrefix}
                  {timeFormatter.format(nextStart)}
                </time>
                （日本標準時）
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-ink-muted">
            刻は東京の真太陽時で区切ります。方位と刻は占い上の目安です。
          </p>
        </section>
        <section>
          <h2 className={headingClass}>この画面で分かること</h2>
          <GuideCharacter pose="compass" size="sm">
            {
              "ここでは生年月日と出発地・目的地を入れ、行き先が今使えるかを真太陽時で確かめられます。本命星別の早見表は"
            }
            <Link href="/houi/today" className="text-accent underline">
              「今日の吉方位と時間」
            </Link>
            {"へ。"}
          </GuideCharacter>
        </section>
        <section>
          <h2 className={headingClass}>生年月日と場所を入れる</h2>
          <p className="text-sm text-ink-muted">
            プロフィールで生年月日と出発地を確認し、地図で目的地を指定できます。
          </p>
          <DashboardTool />
        </section>
        <section>
          <h2 className={headingClass}>いまの要点</h2>
          <p className="text-sm text-ink-muted">
            入力後は道具の「要点」で、いまの方位と刻の相性や次に動ける時刻の目安を確認できます。
          </p>
        </section>
        <section>
          <h2 className={headingClass}>計算の基準</h2>
          <p className="text-sm text-ink-muted">
            年盤・月盤・日盤は日本時間の日付で決まります。刻だけ出発地の経度と均時差を反映した真太陽時で区切り、方位は真北を基準に判定します。占い上の目安であり、効果を保証するものではありません。
          </p>
        </section>
        <section>
          <h2 className={headingClass}>よくある質問</h2>
          <dl className="divide-y divide-theme-border rounded-2xl border border-theme-border bg-theme-surface px-4">
            {FAQ.map(({ question, answer }) => (
              <div key={question} className="py-3">
                <dt className="font-semibold">{question}</dt>
                <dd className="mt-1 text-sm text-ink-muted">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h2 className={headingClass}>次に見る</h2>
          <ul className="flex flex-wrap gap-x-5">
            {NEXT_LINKS.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center text-accent underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
