/**
 * 社寺・名所の一覧をどこから取れるかを、**外から実際に叩いて**確かめる。
 *
 * ## なぜ probe から始めるか
 *
 * 地図に「パワースポット」を出したい、という要望に対して、名称や由緒は
 * 確立した事実として書けるが、**緯度経度は記憶から書くとずれる。**
 * 地図のピンがずれると、それは嘘になる。出典のあるデータ源から取る。
 *
 * 開発環境は外へ出られない（egress で 403）ので、ここで確かめる以外に
 * 手が無い。`probe_zoning` と同じ立ち位置。
 *
 * **読むだけ。DB にも本番にも書かない。**
 *
 * ## 何を確かめるか
 *
 * 1. `search` … Wikidata に「一宮」「二十二社」「名勝」がどう入って
 *    いるかを検索して、候補の QID と説明を出す。**QID を推測で
 *    書かない**ため。ここが分からないまま SPARQL を書くと、0 件が
 *    返ったときに「無い」のか「間違えた」のか区別が付かない
 * 2. `props` … その QID を**何が指しているか**をプロパティ別に数える。
 *    QID を実測しても、繋がり方を推測すると同じ穴に落ちる。実際に
 *    落ちた——一宮（Q1656379）を P31 と P1435 で引いて **0 件**。
 *    どちらでもなかった。**推測でプロパティを並べず、数えさせる**
 * 3. `sparql` … `--qid` と `--prop` で件数と見本を出す。座標（P625）が
 *    入っている割合も見る。**座標が無ければ地図に出せない**
 *
 * ## 相手への負荷
 *
 * Wikidata の公開エンドポイント。1 回の実行で数クエリ、返るのは数百行。
 * 名乗りは**偽装しない**（Wikidata は User-Agent に連絡先を求めている）。
 * 403 を名乗りの変更で越えようとしない——それは相手が断っている印。
 */

const UA =
  "cloud-palette-spot-probe/1.0 (https://cloud-palette.com; contact via site)";

const SEARCH_ENDPOINT = "https://www.wikidata.org/w/api.php";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** 叩く間隔。公開エンドポイントに連打しない。 */
const WAIT_MS = 1500;
const wait = () => new Promise((r) => setTimeout(r, WAIT_MS));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface SearchHit {
  id: string;
  label: string;
  description: string;
}

async function search(term: string): Promise<SearchHit[]> {
  const url =
    `${SEARCH_ENDPOINT}?action=wbsearchentities&format=json&language=ja` +
    `&uselang=ja&type=item&limit=10&search=${encodeURIComponent(term)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.log(`| ${term} | HTTP ${res.status} | — | — |`);
    return [];
  }
  const body = (await res.json()) as {
    search?: { id: string; label?: string; description?: string }[];
  };
  return (body.search ?? []).map((h) => ({
    id: h.id,
    label: h.label ?? "",
    description: h.description ?? "",
  }));
}

interface SparqlRow {
  [key: string]: { value: string } | undefined;
}

async function sparql(query: string): Promise<SparqlRow[] | null> {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    console.log(`\nSPARQL が HTTP ${res.status} を返した。`);
    const text = await res.text();
    console.log("```");
    console.log(text.slice(0, 600));
    console.log("```");
    return null;
  }
  const body = (await res.json()) as { results?: { bindings?: SparqlRow[] } };
  return body.results?.bindings ?? [];
}

async function runSearch() {
  console.log("## 1. 候補の QID を探す\n");
  console.log("**推測で QID を書かないため。**説明を見て人が選ぶ。\n");
  for (const term of ["一宮", "二十二社", "名勝", "特別名勝", "日本百名山"]) {
    console.log(`\n### ${term}\n`);
    console.log("| QID | ラベル | 説明 |");
    console.log("|---|---|---|");
    const hits = await search(term);
    for (const h of hits) {
      console.log(`| ${h.id} | ${h.label} | ${h.description} |`);
    }
    if (hits.length === 0) console.log("| — | 見つからない | — |");
    await wait();
  }
}

/** その QID を指しているプロパティを数える。 */
async function runProps(qid: string) {
  console.log(`## ${qid} を指しているプロパティ\n`);
  console.log(
    "**推測でプロパティを並べない。**一宮を P31 / P1435 で引いて 0 件" +
      "だった（2026-09-05）。QID を実測しても、繋がり方を推測すれば" +
      "同じ穴に落ちる。\n",
  );

  const query = `
SELECT ?p (COUNT(*) AS ?n) WHERE {
  ?item ?p wd:${qid}.
}
GROUP BY ?p
ORDER BY DESC(?n)
LIMIT 30`;

  const rows = await sparql(query);
  if (rows === null) return;
  if (rows.length === 0) {
    console.log("**何も指していない。**この QID は繋がりの先ではない。");
    return;
  }

  console.log("| プロパティ | 件数 |");
  console.log("|---|---|");
  for (const r of rows) {
    /* 返るのは完全 URI。末尾が P番号 なのでそこだけ出す。
       prop/direct/ と prop/ の両方が出るので、URI をそのまま見せて
       どちらか分かるようにする。 */
    const uri = r.p?.value ?? "—";
    console.log(`| ${uri} | ${r.n?.value ?? "—"} |`);
  }
  console.log(
    "\n`prop/direct/P…`（wdt:）が使える形。次は " +
      "`--target sparql --qid " +
      qid +
      " --prop P…` で件数と座標を見る。",
  );
}

async function runSparql(qid: string, prop: string) {
  console.log(`## ${qid} を ${prop} で引いた件数と座標の有無\n`);

  const query = `
SELECT ?item ?itemLabel ?coord ?prefLabel WHERE {
  ?item wdt:${prop} wd:${qid}.
  OPTIONAL { ?item wdt:P625 ?coord. }
  OPTIONAL { ?item wdt:P131 ?pref. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}
LIMIT 400`;

  const rows = await sparql(query);
  if (rows === null) return;

  const withCoord = rows.filter((r) => r.coord?.value);
  console.log(`- 件数: **${rows.length}**`);
  console.log(
    `- 座標あり: **${withCoord.length}**（${
      rows.length ? Math.round((withCoord.length / rows.length) * 100) : 0
    }%）`,
  );
  console.log(
    "\n**座標が無いものは地図に出せない。**割合が低ければ、この分類は" +
      "そのままでは使えない。\n",
  );

  console.log("| 名称 | 所在 | 座標 |");
  console.log("|---|---|---|");
  for (const r of rows.slice(0, 25)) {
    console.log(
      `| ${r.itemLabel?.value ?? "—"} | ${r.prefLabel?.value ?? "—"} | ${
        r.coord?.value ?? "**無し**"
      } |`,
    );
  }
  if (rows.length > 25) console.log(`\n（先頭 25 件。全 ${rows.length} 件）`);
}

async function main() {
  const target = arg("--target") ?? "search";
  if (target === "search") {
    await runSearch();
    return;
  }
  const qid = arg("--qid");
  if (target === "props" || target === "sparql") {
    if (!qid || !/^Q\d+$/.test(qid)) {
      console.log("`--qid Q12345` が要る。まず --target search で探すこと。");
      process.exitCode = 1;
      return;
    }
  }
  if (target === "props") {
    await runProps(qid!);
    return;
  }
  if (target === "sparql") {
    const prop = arg("--prop");
    if (!prop || !/^P\d+$/.test(prop)) {
      console.log(
        "`--prop P123` が要る。まず --target props で、何がその QID を" +
          "指しているかを数えること。**推測で並べない。**",
      );
      process.exitCode = 1;
      return;
    }
    await runSparql(qid!, prop);
    return;
  }
  console.log(`知らない --target: ${target}`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
