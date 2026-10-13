# 最近のあれこれ v3（敦賀の話と、Grok Botの話） — NOTES

- workflow: edit
- last phase: finish (2026-10-13); build g1–g5 done before it
- start file: /workspace/slides/self-intro-v2-gNCCvj/最近のあれこれ.pptx → start.pptx (13 slides → 14)
- presenter: 石橋 真（いしばし まこと）; casual small talk at work; two themes: 敦賀 / Grok Bot
- slide size: 13.333" x 7.5" (16:9)
- v2 generator scripts kept as reference: notes/v2-generators/g1..g5_build.py (v2 paths, do not run)
- v3 generators (paths fixed to this folder, TOTAL=14): notes/v3_lib.py + notes/g1..g5_build.py; final deck = 最近のあれこれ_v3.pptx

## Layout catalog (start deck = v2 navy/orange deck)
- cover: slide1.xml; title left (54pt navy), kicker, subtitle, presenter; right navy panel + orange edge + 九星方位盤 3x3
- agenda cards: slide9.xml; title bar + key message, 3x2 numbered cards 01–06
- profile table: slide2.xml; label/value table left, illustration + 3 like chips right
- split hero: slide15.xml; KPI tiles + points left, big photo right with caption/credit
- three steps: slide10.xml; 3 rising numbered cards with arrows + bottom band
- photo grid: slide3.xml; 3 photo columns with credit + numbered heading + bullets, bottom 名産 band
- split hero (brand): slide21.xml; brand/URL + label rows left, illustration + update tags right
- six grid: slide22.xml; 3 groups x 2 cards with category chips
- band + split: slide7.xml; AI ⇄ 自分 diagram + 指示の出し方 panel + illustration
- two blocks + metric: slide12.xml; numbered blocks left, illustration + big 約800件 metric right
- four list + rail: slide23.xml; illustration + 1-4 rail left, 2x2 numbered cards right
- closing: slide20.xml; navy left panel + 方位盤, big thanks right
- credits table: slide24.xml; table スライド/写真/作者/ライセンス/URL + notes

## Storyboard (14 slides; * = rework, + = new, = = reuse with footer/page fix only)
All body slides: footer page number changes from 「N / 13」 to 「N / 14」 (reuse slides too). Footer text stays 「石橋 真｜最近のあれこれ」.
Section numbers: theme ① 敦賀 = slides 4-6, theme ② Grok Bot・AI開発 = slides 7-11. Builders: replace v2 numbering (01..06) in title bars with a consistent scheme, e.g. 「① 出身地・敦賀市」, 「② Grok Botってなに？」, or drop numbers; keep it consistent across the deck.

1. * 表紙「最近のあれこれ」— cover — slide1.xml. Subtitle → 「敦賀の話と、Grok Botの話」. Keep 方位盤 panel, presenter 石橋 真.
2. * 今日話すこと — agenda cards → two big theme cards — slide9.xml. ① 出身地・敦賀（気比の松原 / 原発 / 港・鉄道・名産）, ② Grok BotとAIに任せる開発（Grok Bot / 使い方 / 開発スタイル / Cloud Palette / second brain）; one small photo per card (kehi_matsubara_user.jpg thumbnail for ①, illust_grokbot.jpg for ②). Small line for ざっくりプロフィール / これから.
3. = ざっくりプロフィール — profile table — slide2.xml. Reuse; may fold one short 独学 line (Web開発→AIに聞きながら学ぶ→MCP) into an existing row if it fits. Page 3 / 14.
4. = 出身地・敦賀市 — split hero — slide15.xml. Reuse (kehi_matsubara_user.jpg hero). Section label to ① scheme. Page 4 / 14.
5. + 敦賀と原発 — three steps → big photo + 3-point timeline — slide10.xml (old 独学 slide file, rebuilt). Big tsuruga_nuclear_power_plant.jpg (left ~60%) + credit; right: timeline 1970年3月 敦賀発電所1号機 運転開始・大阪万博会場へ送電 / 1994年 もんじゅ 初臨界 / 旧「ふげん」などの施設も; neutral tone (no opinion); optional small tsuruga_peninsula_sea.jpg with credit. Facts: facts.md #6 only.
6. * 敦賀のあれこれ — photo grid — slide3.xml. Drop the nuclear column. Columns: 人道の港 (tsuruga_red_brick_warehouse.jpg; ポーランド孤児 1920–21, 杉原千畝「命のビザ」1940), 鉄道と新幹線 (tsuruga_station_shinkansen.jpg; 1912 欧亜国際連絡列車, 2024-03-16 北陸新幹線 終着駅), 名産 (tsuruga_kehi_jingu_torii.jpg or none; 昆布加工 80%以上・おぼろ昆布 2025-03-28 登録無形民俗文化財, へしこ, 敦賀ラーメン). If torii is used, caption it as 氣比神宮 大鳥居 (not as food). Facts: facts.md #4, #2, #5.
7. + Grok Botってなに？ — split hero — slide25.xml (copy of slide15, rebuilt). illust_grokbot.jpg big on the right; left: 「チャットで頼むと、調べ物・資料づくり・定期チェックなどを代わりにやってくれるAIアシスタント」 + 3 points: 調べ物 / 資料づくり / 定期チェック; 自分専用のコンピューターとブラウザを持っている; GmailやGitHubなどともつながる; 2026年9月から使い始めた (KPI tile).
8. + Grok Botの使い方 — six grid → bot tile grid — slide22.xml (old 技術 slide file, rebuilt). Key message 「用途ごとにボットを使い分け」; 8 small tiles: SEO / X投稿 / YouTube / 検索 / 求人探し / 物件情報 / Second Brain / スライド作成 (2 rows x 4, left ~60%); right: illust_bot_slides.jpg + 「今日のこのスライドもGrok Botに作ってもらった（構成・写真集め・イラスト・デザイン）」.
9. * 開発スタイル — band + split — slide7.xml. Agents box: 「Grok Bot・Claude Code・Codex」=実装, 自分=レビュー・方向決め; keep 指示の出し方 panel + illust_ai_dev.jpg; 「学ぶ」→「任せる」. Page 9 / 14.
10. * Cloud Palette — split hero (brand) → screenshot hero — slide21.xml. Tagline 「引越しの方位とタイミングを決める」; https://cloud-palette.com/ as a clickable hyperlink (a:hlinkClick + external rel); cp_top.png large (1024x640, keep 16:10 ratio, no stretch) + cp_feature1.png / cp_feature2.png small; features: 方位で街を探す / 引越し先を試算 / 本命星と吉方位 / 風水（八宅）; tags MCPサーバー NEW / ニュース NEW; small tech row: Next.js・React・TypeScript・Supabase・Vercel・Google Cloud. Remove illust_compass.jpg. Screenshot credit: 自作サイト.
11. * second brain — two blocks + metric — slide12.xml. Focus on second brain only: 約800件のAI会話をObsidianで集約 / 自動分類 / AI要約 / 検索用MCP; keep illust_second_brain.jpg + 約800件 metric. Drop the 「作業を丸ごと任せる」 and Cloud Palette MCP blocks (covered on 9/10). Title not 「最近の状況」 → e.g. 「second brain」.
12. = これからやりたいこと — four list + rail — slide23.xml. Reuse; page 12 / 14.
13. = ご清聴ありがとうございました — closing — slide20.xml. Reuse; page 13 / 14.
14. * 写真クレジット — credits table — slide24.xml. Rows for photos used: 4 kehi_matsubara_user (敦賀うまいもん), 5 発電所 (+ 敦賀半島 if used), 6 赤レンガ倉庫 / 敦賀駅 / 氣比神宮 大鳥居 (if used), 10 Cloud Palette screenshots = 自作サイト（cloud-palette.com）; 「※ イラスト：AIで生成」. Remove v2 slide-5 numbering. Small text ≥ 9pt; may need 2 columns or tighter rows (7-8 rows).

Layout use: split hero x3 (4, 7, 10; not adjacent), photo grid 1, six grid 1, three steps 1, rest 1 each. No two adjacent slides share a layout. Text-only slides: none (2 gets thumbnails, 12-14 as before).
Suggested groups: g1 = 1-3, g2 = 4-6, g3 = 7-9, g4 = 10-12, g5 = 13-14.

## Design decisions (unchanged from v2; apply on every slide)
- Fonts: BIZ UDPGothic (BIZ UDPゴシック) for all runs (latin/ea/cs); titles bold.
- Colors: white FFFFFF base; navy 1F3A5F (title bar, headings); orange F28C28 (accent line, numbers, key message bar); text 222222; muted 666666; light panel F3F5F8; rule D0D7E2.
- Body chrome: navy title bar ~0.95" with white bold 28pt title; orange line 0.06" under it; key-message line 16–18pt bold navy with orange left bar; footer rule + 「石橋 真｜最近のあれこれ」 10pt muted left, 「N / 14」 right.
- Cover and closing: white base, navy block + orange line + 方位盤 motif; no page number on cover.
- Type scale: title 28pt, key 16–18pt, body 14–16pt, sub 12–13pt, captions/credits 9–10pt muted.
- Every content slide has at least one photo/screenshot/illustration; photo credit 9pt under each photo + credits slide.
- Pictures: keep native ratio (cover-crop or fit; never stretch). tsuruga_kehi_matsubara_beach.jpg is 0 bytes — do not use.
- Speaker notes in Japanese, casual tone, on every slide; source URLs in notes.
- Banned words (slides + notes + docProps): 自己紹介, 地元, 研修, 自作PC, 自炊, はじめまして, 気軽に話しかけ, 社内.
- Section numbers: ① on slides 4–6, ② on slides 7–11; no number on 2, 3, 12, 14 (item numbers 01–04 inside slide 12 cards are list items, not sections).
- Tone on 原発: neutral facts only.

## Fact sources
- 敦賀 facts: /workspace/slides/self-intro-assets/facts.md (https://ja.wikipedia.org/wiki/敦賀市, fetched 2026-10-13).
- Photo credits: /workspace/slides/self-intro-assets/credits.md (Wikimedia Commons); kehi_matsubara_user.jpg = 敦賀うまいもん (tsuruga-umaimon.com), user-supplied.
- Cloud Palette screenshots cp_*.png: user's own site (https://cloud-palette.com/).
- Illustrations illust_*.jpg: AI-generated.
- Grok Bot description, bot list, start 2026年9月, 開発スタイル, Cloud Palette features, second brain 約800件・Obsidian: user brief.

## Build notes (merged from notes/g1..g5.md)

### g1 notes (build, 2026-10-13)
- Generator: notes/g1_build.py (v2 generator adapted; shared helpers in notes/v3_lib.py with W → this folder, TOTAL = 14).
- Rebuild: run `python3 notes/g1_build.py` from any folder; it rewrites only this group's slide files, their notes and rels.
- 1 cover (slide1.xml): kicker 社内トーク → ちょっと雑談 (banned word); subtitle 敦賀の話と、Grok Botの話.
- 2 agenda (slide9.xml): two theme cards ①/② with kehi_matsubara_user.jpg + illust_grokbot.jpg thumbnails, chips, bookend line.
- 3 profile (slide2.xml): no section number; 独学 line folded into 個人開発 row.

### g2 notes (build, 2026-10-13)
- Generator: notes/g2_build.py (v2 generator adapted; shared helpers in notes/v3_lib.py with W → this folder, TOTAL = 14).
- Rebuild: run `python3 notes/g2_build.py` from any folder; it rewrites only this group's slide files, their notes and rels.
- 4 (slide15.xml) ① 出身地・福井県敦賀市: v2 content, number → ①.
- 5 (slide10.xml) ① 敦賀と原発: big photo + 3-point timeline; facts.md #6 only; neutral.
- 6 (slide3.xml) ① 敦賀のあれこれ: 人道の港 / 鉄道と新幹線 / 名産 (80%以上 big-number tile instead of torii photo); facts.md #4, #2, #5.

### g3 notes (build, 2026-10-13)
- Generator: notes/g3_build.py (v2 generator adapted; shared helpers in notes/v3_lib.py with W → this folder, TOTAL = 14).
- Rebuild: run `python3 notes/g3_build.py` from any folder; it rewrites only this group's slide files, their notes and rels.
- 7 (slide25.xml) ② Grok Botってなに？: 3 tiles + 3 point rows, illust_grokbot.jpg, 2026年9月 KPI.
- 8 (slide22.xml) ② Grok Botの使い方: 8 bot tiles (2x4), illust_bot_slides.jpg + スライド作成 panel.
- 9 (slide7.xml) ② 開発スタイル: agents box Grok Bot・Claude Code・Codex.

### g4 notes (build, 2026-10-13)
- Generator: notes/g4_build.py (v2 generator adapted; shared helpers in notes/v3_lib.py with W → this folder, TOTAL = 14).
- Rebuild: run `python3 notes/g4_build.py` from any folder; it rewrites only this group's slide files, their notes and rels.
- 10 (slide21.xml) ② Cloud Palette: hyperlink https://cloud-palette.com/ (rIdCPLink, external); cp_top.png 4.9x3.06 (16:10) + 2 small 16:10 shots; illust_compass removed.
- 11 (slide12.xml) ② second brain: 4-step flow 集約→自動分類→AI要約→検索用MCP + 約800件 metric.
- 12 (slide23.xml) これからやりたいこと: v2 reuse, no section number, 12 / 14.

### g5 notes (build, 2026-10-13)
- Generator: notes/g5_build.py (v2 generator adapted; shared helpers in notes/v3_lib.py with W → this folder, TOTAL = 14).
- Rebuild: run `python3 notes/g5_build.py` from any folder; it rewrites only this group's slide files, their notes and rels.
- 13 (slide20.xml) closing: 13 / 14.
- 14 (slide24.xml) credits: 5 rows (4, 5, 6, 6, 10) + イラスト：AIで生成; 社内利用 wording removed (banned).

## Defects left
- Slide 4: hero photo 640x427 (user-supplied) may look soft on a big screen.
- Slide 10: the two small Cloud Palette screenshots (≈2.2" wide) are hard to read; they are visual texture only.
- Slide 12: cards 02/04 have some white space (carried over from v2).
- Slide 14: 敦賀うまいもん photo has no license statement at source (stated on slide).

## v4 (2026-10-13, edit)
- Deck: 最近のあれこれ_v4.pptx (from v3, unpacked into unpacked-v4/; builder notes/v4_build.py, script notes/v4_script.py).
- Slide 8 (slide22.xml): 求人探し tile removed; 7 tiles = 4 on top + 3 wider on the bottom, same grid edges; スライド作成 stays highlighted bottom-right.
- Speaker notes: full spoken script (~15 min, 3,732字 without headers) on all 14 slides; source URLs kept as a 参考（読まない） line on 4, 5, 6, 10.
- script.txt / script_tts.txt: per-slide 【スライドN】 sections; TTS version uses hiragana/katakana readings.
- Banned words added: 求人, 転職 (and no job-hunting wording anywhere).
