-- Search Console の日次実績を貯める表を足す。
--
-- ## なぜ要るか
--
-- src/lib/searchConsole.ts は既に検索クエリ別の実績を取れるが、
-- **その場で叩いてその場で捨てている。**画面を開いた瞬間の値しか
-- 見えないので、
--
--   「この記事を出してから表示回数が伸びたのか」
--   「順位が上がっているのか下がっているのか」
--
-- が分からない。Search Console の画面は 16 か月で消えるうえ、
-- API も同じ期間しか返さない。**貯めないと後から追えない。**
--
-- AdSense が「有用性の低いコンテンツ」で止まっている状況で、
-- どの記事が効いたのかを測れないまま書き足すのは当てずっぽうになる。
--
-- ## 鍵は (date, query, page)
--
-- Search Console の searchanalytics は次元の組み合わせで返す。
-- date だけだと日の合計しか残らず、query だけだと日をまたいだ比較が
-- できない。3 つ揃えて 1 行にする。
--
-- **page も鍵に入れる。**同じ語で複数の頁が出ることがあり、入れないと
-- 片方がもう片方を黙って上書きする。「どの記事がその語を拾ったか」は
-- 記事を書き足すときにいちばん要る情報でもある。
--
-- ## 個人情報は入らない
--
-- Search Console が返すのは**集計済みの検索語**で、利用者の識別子は
-- 含まれない。Google 側で出現回数の少ない語は落としてから返す
-- （個人が特定され得る語を出さないため）。IP も UA も無い。
--
-- ## 既定値を置かない
--
-- clicks / impressions / ctr / position はすべて API の実測値で、
-- 取れなければ行を作らない。DEFAULT を置くと「0 回だった日」と
-- 「取れなかった日」の区別が消える。
--
-- created_at の DEFAULT now() は「行を作った時刻」であって、
-- 判定や集計に使う値ではないので置いてよい。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の search_console_daily と揃えること。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS "search_console_daily" (
  -- 検索が起きた日（Search Console のタイムゾーンは太平洋時間）。
  -- 実績は 2〜3 日遅れて確定するので、取り込みは余裕を持って引く。
  "date" DATE NOT NULL,
  -- 検索語。Google 側で集計済みのものだけが返る。
  "query" TEXT NOT NULL,
  -- その語で表示された頁の URL。
  "page" TEXT NOT NULL,

  -- 実測値。取れなければ行を作らないので NOT NULL。
  "clicks" INTEGER NOT NULL,
  "impressions" INTEGER NOT NULL,
  -- clicks / impressions。API が返す値をそのまま持つ（自分で割らない）。
  "ctr" DOUBLE PRECISION NOT NULL,
  -- 平均掲載順位。1.0 が 1 位。小さいほど良い。
  "position" DOUBLE PRECISION NOT NULL,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "search_console_daily_pkey"
    PRIMARY KEY ("date", "query", "page")
);

-- 「この語は最近どうなっているか」を日付順に引く。
CREATE INDEX IF NOT EXISTS "search_console_daily_query_date_idx"
ON "search_console_daily" ("query", "date");

-- 「この記事はどう伸びたか」を頁から引く。記事を書き足すときの入口。
CREATE INDEX IF NOT EXISTS "search_console_daily_page_date_idx"
ON "search_console_daily" ("page", "date");

-- 「その日いちばん表示された語」を出す。題材探しの入口。
CREATE INDEX IF NOT EXISTS "search_console_daily_date_impressions_idx"
ON "search_console_daily" ("date", "impressions" DESC);
