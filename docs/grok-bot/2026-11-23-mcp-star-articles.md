# 星ごとの記事を search_articles で返す（2026-11-23）

- 依頼: 九星の星ごとのブログ記事があるなら MCP で呼び出せるようにする。専用記事はほぼ無いとの本人の補足があり、専用が無い星でも関連記事（本文やタグに公式名が出る方位・年運の記事など）を関連の強い順に返す。結果では専用と関連を区別する。案内役（/annai）の本命星の結果にも出す。記事を新たに書くのは範囲外。公開 MCP の道具数は増やさない。コードは box 上の Codex CLI（`codex exec -s workspace-write`）。テストと lint を通し、PR を作り CI を待つ。マージはしない。
- PR: https://github.com/ishibashm/portfolio/pull/1906 （未マージ。ブランチ `feat/mcp-star-articles`、基点は origin/master の edf0bd51 = #1903）
  - f8282f62 search_articles で本命星・月命星の専用記事と関連記事を返す
- 現状:
  - 案内役の本命星は、get_honmei_star のあと search_articles を `{ query: "本命星", limit: 3 }` で呼んでおり、特定の星の記事を確実には返せなかった。
  - 公開中の Markdown（draft・テーマ外を除く 58 本）に、タイトルまたは単独タグがその星だけの専用記事は無い。
- 変更内容:
  - 既存の `search_articles` に任意の `star`（1〜9）と `aspect`（honmei / getsumei / both。既定は honmei）を足した。星指定時は query を省略でき、最大 20 件。従来のキーワード検索は最大 5 件のまま。公開道具数（18）は変えていない。
  - 専用（`relation: "dedicated"`）は、タイトルまたはタグに公式名（一白水星〜九紫火星）があり、他の公式名がタイトルにもタグにも無い記事。関連（`relation: "related"`）は、タイトル・タグ・説明・見出し・本文に公式名が出る記事。短縮形（一白、五黄など）では拾わない。
  - 見出しが公式名と完全一致する節があれば `section` を付ける。全9星の見出しを持つ概説は専用にせず、関連として返す。
  - `dedicatedCount` / `relatedCount` は limit で切る前の総数。
  - 月命星（`aspect: "getsumei"`）は、本文・タグ・見出し・タイトルに「月命星」がある記事に限る。「月命」（月命殺など）だけでは拾わない。
  - 案内役は、分かった本命星で `{ star, limit: 5 }` を呼ぶ。立春前後の候補が2つあるときは両方を探し、slug の重複を除く。画面では「専用」「関連」の短いラベルを付ける。
- 公開 Markdown での件数（MCP と同じ公開条件。数字は limit 適用前）:

  | 九星 | 専用（本命） | 関連（本命） | 専用（月命星） | 関連（月命星） |
  | --- | ---: | ---: | ---: | ---: |
  | 一白水星 | なし（0） | 17 | なし（0） | 2 |
  | 二黒土星 | なし（0） | 11 | なし（0） | 2 |
  | 三碧木星 | なし（0） | 10 | なし（0） | 2 |
  | 四緑木星 | なし（0） | 11 | なし（0） | 2 |
  | 五黄土星 | なし（0） | 12 | なし（0） | 2 |
  | 六白金星 | なし（0） | 14 | なし（0） | 2 |
  | 七赤金星 | なし（0） | 18 | なし（0） | 2 |
  | 八白土星 | なし（0） | 11 | なし（0） | 2 |
  | 九紫火星 | なし（0） | 14 | なし（0） | 2 |

  本命の関連では、全星で `honmeisatsu-year-board-next-move` が該当星の `section` 付きで先頭に来る。月命星の関連は、各星とも `same-birth-year-personality` と `todays-lucky-direction-by-hour`（一般的な月命星の説明で、星ごとの専用ではない）。
- 呼び出し例（`search_articles({ star: 3, limit: 2 })`。starName は三碧木星、dedicatedCount 0、relatedCount 10）:
  - 「年盤で本命殺へ引っ越したあと、次にどう動くか」（`honmeisatsu-year-board-next-move`、related、section: 三碧木星）
  - 「2027 年春の引越し、本命星ごとに年盤と月盤がそろう方位と日。3 月はどの星にも無い」（`spring-2027-moving-directions-by-star`、related）
- 確認: ローカルで mcpArticles / guide などの関係テストを実行して通過。変更ファイルの eslint / prettier も通過。
- CI: check が成功。GitHub Actions run 45110831830（2026-11-23 13:16 開始 → 13:31 完了 JST、所要 15分15秒）。 https://github.com/ishibashm/portfolio/actions/runs/45110831830
- 本番の設定・DB は変更していない。マージは本人の承認待ち。記事を足すかどうかは、上の表を本人が見て決める。
