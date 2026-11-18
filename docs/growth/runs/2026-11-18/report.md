# サイト改善・成長の実行レポート

- 実行時刻: 2026-11-18T13:39:37.433Z
- 対象: https://cloud-palette.com
- 文章の補足: heuristic。外部の言語モデルは呼んでいない
- マージ: しない
- デプロイ: しない

流入は検索・AI の引用・共有・戻ってくる動線、収益は審査通過後の広告と、通過前の誤解のない紹介で増やす。阻害は AdSense 審査は未通過。次に効くのは「AdSense の再申請は所有者が出す」（得点 49）。枠の自動適用はしない。

## 差分

前回の report.json は無い。この実行が基準になる。

## 監査と収益化

- **良好** 中核ルートを1か所から数えた（auditor.core-routes）
  - 公開の中核は 18 本。llms.txt は同じ定義から出る。
  - 根拠: src/lib/siteStructure.ts、src/app/llms.txt/route.ts
- **良好** MCP の公開道具が案内と揃っている（auditor.mcp-surface）
  - 公開道具 18 個。llms.txt は /api/mcp に触れている。
  - 根拠: src/lib/mcpServer.ts
- **低** noindex の頁は自分の canonical を書いていない（auditor.canonical-noindex）
  - 8 頁。索引には出さないので、ホームの canonical を継承しても検索結果の重複にはなりにくい。
  - 根拠: src/app/admin/blog/page.tsx、src/app/admin/metrics/page.tsx、src/app/admin/practitioners/page.tsx、src/app/login/page.tsx、src/app/profile/connections/page.tsx、src/app/profile/mcp/page.tsx、src/app/profile/memory/page.tsx、src/app/relocation/candidates/page.tsx
- **良好** 同じディレクトリに canonical が無い索引頁は見当たらない（auditor.canonical）
  - ルート layout の / を、子が黙って継承している頁は、この見方では残っていない。
  - 根拠: src/app
- **良好** 子ページの openGraph は pageOpenGraph 経由（auditor.open-graph）
  - 共有カードがホームの題と URL のままになる書き方は見当たらない。画像は共通の /ogp.png が多い。
  - 根拠: src/lib/siteUrl.ts
- **良好** 索引頁は大きい画像プレビューを許している（auditor.image-preview）
  - Discover は大きい画像プレビューを使う。頁側の robots で上書きすると落ちる。
  - 根拠: src/lib/siteStructure.ts
- **良好** 運営チャンネルの sameAs（auditor.same-as）
  - 4 件を Organization に出している。作っていないチャンネルは足さない。
  - 根拠: src/lib/siteChannels.ts
- **中** 本文の短い公開記事がある（auditor.short-posts）
  - 下書きを除き、可算文字 2000 未満が 13 本。審査で「有用性が低い」とされたあとの残件。
  - 根拠: content/blog/does-a-lucky-move-cancel-an-unlucky-move.md (1577)、content/blog/houi-and-tenchusatsu.md (1750)、content/blog/what-is-hinoeuma.md (1750)、content/blog/kuubou-schools-and-directions.md (1813)、content/blog/how-many-schools-are-there.md (1847)、content/blog/consultation-purpose-and-five-elements.md (1886)、content/blog/doyou-and-doyousatsu.md (1888)、content/blog/turning-point-three-people.md (1897)
- **良好** 市区町村のリードは 200 字以上（auditor.area-depth）
  - 固有文 349 件、そのうち索引条件を満たすのは 331 頁。雛形のままの頁は索引に載せない。
  - 根拠: src/lib/areaEditorial.ts、src/lib/areaAffiliate.ts
- **良好** 信頼頁と広告の開示が揃っている（monetization.trust-pages）
  - about / contact / privacy / editorial があり、プライバシーは AdSense・アフィリエイト・外部送信・欧州経済領域と、問い合わせへのリンクを持つ。
  - 根拠: src/app/about/page.tsx、src/app/contact/page.tsx、src/app/privacy/page.tsx、src/app/editorial/page.tsx
- **阻害** AdSense 審査は未通過（monetization.adsense-review）
  - 不承認理由は「有用性の低いコンテンツ」（2026-11-12 の記録）。再申請は所有者が管理画面で出す。この実行は申請しない。
  - 根拠: growth.config.json、docs/adsense-rereview-plan.md
- **良好** ads.txt は実 ID が無いとき 404（monetization.ads-txt）
  - ゼロ埋めの見本 ID は配信しない。本番の ID はこのレポートに書かない。
  - 根拠: src/app/ads.txt/route.ts、src/lib/adsense.ts
- **中** 同意バーはある。認定 CMP ではない（monetization.consent）
  - 同意までは非パーソナライズ。選択は端末の localStorage だけで、審査用スクリプトは head に残す。欧州でパーソナライズ広告を出すには、Funding Choices などの認定 CMP がまだ要る。
  - 根拠: src/lib/adConsent.ts、src/components/ads/AdConsentBar.tsx、src/app/layout.tsx
- **低** 手動枠は空のままにしない（monetization.slots）
  - スロットが有効なときだけ描き、高さ 250px を先に確保し、画面の近くに来てから push する。自動広告のアンカーとビネットは、通過後に管理画面で切る（CLS と誤タップ）。
  - 根拠: src/components/ads/AdBanner.tsx
- **低** 審査前の代替は引越し案件に寄せている（monetization.affiliate）
  - 掲載 ID は hakobu-moving、rakuten-market。ハコブは 6 箇所で、対象地域の注記はある。楽天は 2 箇所。DMM FX はリストに無い。楽天は風水の記事にあり、買い物が主題ではないので増やさない。
  - 根拠: src/lib/affiliateOffers.ts、src/lib/areaAffiliate.ts

## 本番の確認

自サイトの公開 URL だけを見た。本文と広告 ID は残していない。

- 到達 /robots.txt 200 Sitemap を宣言している
- 到達 /llms.txt 200 MCP の入口に触れている
- 到達 /llms-full.txt 200 MCP の入口に触れている
- 到達 /ads.txt 200 google.com の DIRECT 行がある。ID は記録しない
- 到達 /privacy 200 プライバシーの文言がある
- 到達 /sitemap.xml 200 loc 1 件（索引か子サイトマップ）

## 優先バックログ

- **49** AdSense の再申請は所有者が出す（monetization、影響 5、工数 1、自動適用 不可）: 有用性の指摘が残っているあいだに同じ内容で何度も出さない。マージやこの実行では申請しない。
- **38** 通過後は手動枠を記事末と地域頁に限る（monetization、影響 4、工数 2、自動適用 不可）: 自動広告のアンカーは CLS と誤タップを増やす。記事・使い方・市区町村の末尾だけに 250px の枠を置き、トップの最初の画面には置かない。スロット ID が無いあいだは空枠を出さない。
- **38** 短い動画の概要欄から道具の URL へ戻す（video、影響 4、工数 2、自動適用 不可）: 方位と住まいの手帖は sameAs にある。動画単体で終わらせず、今日の吉方位・日取り・地域頁のどれか 1 本へ戻す。
- **37** 短い記事を一次情報の範囲で厚くする（content、影響 4、工数 3、自動適用 不可）: 2000 字未満が 13 本。相場の額や健康の断定は足さない。審査の「有用性」に直接効く。
- **37** 引越し費用の見積もりと方位を同じ頁で説明する（traffic、影響 4、工数 3、自動適用 不可）: 検索の意図「引越し 費用 相場」に、題名が直接応える記事が無い。既存の道具（/calendar・/houi・/relocation/purchase）へ戻す内部リンクを先に置く。
- **29** llms.txt と MCP の道具一覧をずらさない（traffic、影響 3、工数 1、自動適用 不可）: AI 検索の引用は /llms.txt と /api/mcp が入口。道具を足したときは案内文も同じ PR で更新する。
- **27** 欧州向けは認定 CMP に切り替える（monetization、影響 3、工数 3、自動適用 不可）: 自前バーは非パーソナライズの既定まで。パーソナライズ広告の収益を欧州で取るなら Funding Choices など認定済みの同意が要る。
- **27** 共有用の画像を頁の題入りにする（illustration、影響 3、工数 3、自動適用 不可）: 多くの頁が同じ /ogp.png を使う。/houi と /calendar と記事だけでも題の入った 1200×630 にすると、チャットと SNS からの戻りが増える。

## コンテンツ・図・動画の草案

### 共有画像の指示（/houi と /calendar）

1200×630。地色は #faf7f3、文字は #292524、アクセントは赤みのある #9f1239。写真は使わない。方位は八方位の円、日取りは月の升目を 1 つ。題は頁の title のまま。効果や金運の約束は書かない。「Cloud Palette」を小さく添える。

### 30 秒の構成（今日の吉方位）

0–3 秒: 今日の日付と「八方位は人によって違う」。4–20 秒: 本命星を 1 つだけ例にし、吉と凶が同時にあることを画面の /houi/today で示す。21–30 秒: 出発地を入れる場所を指し、概要欄の URL は https://cloud-palette.com/houi/today 。健康・金運の断定はしない。

### 30 秒の構成（引越しの日取り）

暦注は誰でも同じ、方位は生年月日と出発地で変わる、という順で /calendar を映す。終わりに「日の吉は方位の凶を消さない、とされる」とサイトの注記を読み、URL は https://cloud-palette.com/calendar 。

### 記事の骨子: 費用と方位は別の問い

結論を先に 1 段落。費用の相場そのものは書かず、/relocation/purchase と /relocation/market が何の統計かを説明し、方位は /houi で別に見る、と分ける。内部リンクは 3 本まで。アフィリエイトは 1 都 3 県の記事だけ、文中に対象地域と PR を書く。

## Builder

自動で適用する項目は無い。低リスクの修正は、このフレームワークの外で PR の差分にする。マージは所有者が明示するまで行わない。

## 検証

- 通過 merge-disabled: レポートの merge と deploy は false 固定
- 通過 no-auto-apply: Builder の適用は 0 件
- 通過 no-third-party-scan: 見た URL は自サイトのパスだけ
- 通過 consent-or-listed: 同意の状態を findings に出している

## 役割

- auditor: 頁・MCP・llms.txt・canonical・記事と地域の厚みを、前回との差分が取れる ID で出した。
- growth: 題名に無い検索意図と、共通 OGP・動画からの戻りを優先した。新しい数字の相場は作っていない。
- monetization: 審査は未通過のまま。再申請はしない。同意の既定、ads.txt、空枠を出さないこと、審査前の案件を分けた。
- planner: 得点は影響×10から工数を引いた。自動で適用してよい項目は空のままにする。
- content: 骨子だけ。本文の額と健康の断定は書かない。
- design: 広告は高さ 250px を先に取り、同意バーは固定で本文を押し下げない。
- media: 30 秒の構成と画像の指示だけ。ファイルは生成していない。
- builder: リポジトリは変更しない。低リスクの修正は、別途レビューできる差分として人が出す。
- verifier: マージ禁止・識別子の除去・自サイト以外へ出ないことを、レポート生成時に検査する。

## 人が止めるもの

- AdSense 審査は未通過: 不承認理由は「有用性の低いコンテンツ」（2026-11-12 の記録）。再申請は所有者が管理画面で出す。この実行は申請しない。

このファイルは成長フレームワークの出力。判定のしきい値は変えていない。
