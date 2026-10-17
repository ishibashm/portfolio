# 初代 案内役「しるべ」

サイトの案内役のキャラクター。紺の羽織（金の縁取り・朱の房飾り）に金の羅盤を持つ、
方位と暦を学ぶ若い易者。等身は通常（デフォルメなし）。

## 出どころ

- **2026-10-17 に AI で生成したオリジナルのイラスト**。既存の作品・人物を写したものではない。
  記事「占いの土台は4つ」（PR #1691）の動画スライド用に作った案内役と同じ絵柄・同じ人物。
- 元絵は 1280×720 の無地の藍色背景。`scripts/guide/make_guide_assets.py cut` で背景を抜き、
  `public/guide/shirube-<pose>-master.png` に透過の原本を置いている。
- 派生画像（AVIF / WebP、96・240・480 幅）は `make_guide_assets.py derive` で原本から作り直せる。
  目安は 96 幅 15KB 以下、240 幅 40KB 以下、480 幅 80KB 以下（スクリプトが超えたら止まる）。

| ポーズ                   | ファイル              | 使っている所                                                                           |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------- |
| pointing（指さし）       | `shirube-pointing-*`  | トップ「AIに聞く」（`components/home/AgentEntry.tsx`）                                 |
| magnifier（虫めがね）    | `shirube-magnifier-*` | 404（`app/not-found.tsx`）・エラー（`app/error.tsx`）                                  |
| compass（羅盤と暦）      | `shirube-compass-*`   | 質問画面の準備中・計算中（`AgentEntry` / `HomeAgentChat` / `app/ask/McpExplorer.tsx`） |
| thumbsup（スマホと親指） | `shirube-thumbsup-*`  | 記事末尾の道具への導線（`components/blog/ArticleToolCta.tsx`）                         |

## 使い方の決まり

- 表示は必ず `components/guide/GuideCharacter.tsx`（`GuideCharacter` / `GuideAvatar`）を通す。
  width/height・srcset・sizes・lazy をここで揃えている。
- **既定は loading="lazy"。**最初の画面に入るトップの「AIに聞く」だけ `priority="low"`
  （eager + fetchPriority="low"）。記事のヒーロー画像など頁の主役より上には置かない。
- 台詞は案内に留め、吉凶を断定しない。結果の近くでは「参考情報です」の文言を残す。
- 記事の著者・構造化データ（JSON-LD の author / publisher）は組織のまま。キャラクターを著者にしない。
