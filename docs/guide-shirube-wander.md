# しるべ歩き回り（`ShirubeWanderer`）の本番組み込み手順

この試作は `feat/shirube-wander` ブランチのデモ（`/demo/shirube`）に閉じ込めてあり、本番のトップページや共通レイアウトにはまだ組み込んでいません。後から本番サイトへ載せる場合は、以下の手順と注意点を確認したうえで進めてください。

## 1. インポートするファイル

```tsx
import { ShirubeWanderer } from "@/components/guide/ShirubeWanderer";
```

- 表示は部品分けしたちびしるべ `ShirubeWalkRig`（`src/components/guide/ShirubeWalkRig.tsx`）です。素材は `public/guide/walk/` の 3 枚（`leg-far`・`leg-near`・`body`、各 128px / 240px の WebP と PNG、合計 100KB 未満）。
- 3 枚は同じキャンバス寸法（原寸 517×1063）なので重ねるだけで位置が合います。足は袴の裾に隠れた付け根を軸に CSS の `rotate` で振り、付け根より上は袴の内側まで足を伸ばしてあるので隙間は出ません。
- 元絵は右向きです。左へ歩くときだけ `scaleX(-1)` で反転します。
- 素材の作り直し: `/workspace/shirube-walk/build_rig.py`（横向き。背景抜き＝rembg isnet-anime → 部品分け）、`build_front.py`（正面）、`build_shuffle.py`（すり足 4 コマ）と `render.py`（プレビューと keyframes の値）。共有パソコン上の作業用で、リポジトリには入れていません。

## 1-2. 動きの中身

- 歩行中（`data-state="walking"`）: 手前と奥の足を ±24° で交互に振り、振り出す足を少し持ち上げる。体は 1 サイクルに 2 回はずむ（PC で約 2.6px）。体はわずかに前傾して揺れる。
- 1 サイクルは PC 1.08 秒・スマホ 1 秒（CSS 変数 `--shirube-cycle`）。歩く速さ（PC 26px/秒・スマホ 14px/秒）と一歩の長さを合わせて、足が地面を滑って見えないようにしてあります。表示の高さを変えるときは `--shirube-h` と速さを一緒に変えてください（速さ ≒ 高さ × 0.234 ÷ サイクル秒）。
- 立ち止まり・振り返り中: 足をそろえ、胴体だけゆっくり呼吸する。
- 正面であいさつ（`data-state="greeting"`）: 目的地に着いたとき 45% の確率で、横向きから正面の絵へ 160ms で切り替え（小さく弾む）、2.6〜4.2 秒のあいだ呼吸しながら手を振る。終わると横向きに戻り、0.7 秒おいて歩き出す。
  - 正面の素材は `front-body`（胴体）と `front-hand`（手首から先）の 2 枚。手首を軸に −18°〜+10° で振る。頭の上と足裏の高さは横向きとそろえてある。
  - 左向きで止まっても、正面の絵は反転させない（いつも同じ手で振る）。
  - 正面を向かせたくないときは `greet={false}`。
- `prefers-reduced-motion: reduce`: アニメーションなし。右下で正面を向いて静かに立つ。

## 1-3. すり足（4 コマのスプライト）

元の 4 コマのすり足しるべを、背景を抜いて足元の高さをそろえた横並びの 1 枚（`public/guide/walk/shirube-shuffle-{128,240}.webp`、21KB / 52KB）にしてあります。コマ送りは `transform` の `steps(4)` だけで、0.96 秒で 4 コマ。

- **画面下の歩き回りで使う**: `<ShirubeWanderer gait="shuffle" />`。歩く速さは PC 16px/秒・スマホ 9px/秒と遅めで、正面は向きません。
- **画面下以外に置く小物**: `<ShirubeShuffle />`（`src/components/guide/ShirubeShuffle.tsx`）

```tsx
import { ShirubeShuffle } from "@/components/guide/ShirubeShuffle";

<ShirubeShuffle size={56} />                         // その場で足踏み
<ShirubeShuffle size={44} travel travelSeconds={16} /> // 置いた箱の横幅を行ったり来たり
<ShirubeShuffle size={48} label="読み込み中" />       // 読み上げあり（role="img"）
```

- 使いどころの例:
  - カードやお知らせの角に小さく置く（例: 「今日の吉方位」カードの右下、記事末尾の「次の記事へ」の横）。
  - お知らせの帯・空の一覧（「まだ保存した候補はありません」）の下線の上を行ったり来たり。
  - 読み込み中・計算中の表示（`role="status"` の中に `label` 付きで）。
  - 404 ページやメンテナンス表示の飾り。
- 置き方の注意: 既定は `aria-hidden` の飾り。`travel` は親の横幅（コンテナクエリ `100cqw`）を使うので、親にブロック要素を用意する。動きを減らす設定では 1 コマ目で止まり、移動もしない。
- デモ `/demo/shirube` の「すり足しるべ（小物）の置き方の例」と、上部の「歩き方」切り替えで両方を確認できます。

## 2. レイアウトまたは特定ページへの置き方

### 特定ページにだけ置く場合（推奨・段階導入向け）

対象ページの JSX 末尾に 1 行足します。固定配置（`position: fixed; bottom: 0`）のため、本文レイアウトの押し出し（CLS）は起きません。

```tsx
<ShirubeWanderer />
```

### サイト全体へ置く場合

`src/app/layout.tsx` の `</body>` 直前（`<SiteFooter />` より後ろ）に `<ShirubeWanderer />` を置きます。

```tsx
<div className="flex min-h-screen">
  <GlobalSidebar />
  <div className="flex min-w-0 w-full flex-1 flex-col">
    <main className="flex-1 w-full min-w-0 pt-14 lg:pt-0">{children}</main>
    <SiteFooter />
  </div>
</div>
<ShirubeWanderer />
```

## 3. 組み込み時の注意点

- **pointer-events**: 外側ステージ（`.shirube-wander-stage`）は常に `pointer-events: none` です。既定（`onInteract` 未指定）ではキャラ本人も `pointer-events: none` のため、下部のボタン・リンク・フッター操作を塞ぎません。クリック動作を付ける場合も `onInteract` 経由でキャラの最小領域だけに留めてください。
- **サイズとスマホ配慮**: 表示の高さはスマホ 60px・PC 120px（幅はそれぞれ約 30px / 59px）。
- **下部の固定ボタンをよける**: 画面下端に接した `position: fixed / sticky` の操作要素（ボタン・リンクを含む帯）と、`data-shirube-avoid` を付けた要素を見つけると、その上端＋4px より上を歩きます（`--shirube-lift`、上限は画面の高さの 35%）。iPhone のホームバー（`safe-area-inset-bottom`）も避けます。自動で見つからない帯には `data-shirube-avoid` を付けてください。不要なら `avoidBottomObstacles={false}`。デモの「下部の固定ボタン帯を出す」で確認できます。
- **prefers-reduced-motion**: 本番の既定（`forceReducedMotion` 未指定）は OS の `prefers-reduced-motion: reduce` を自動判定し、reduce 時は `requestAnimationFrame` を回さず画面下端の右寄り（`restSide` で変更可）に静止表示します。本番では `forceReducedMotion` を固定指定しないでください。
- **トップや主要 CTA・既存しるべとの重複**: トップの「しるべに案内してもらう」など既存の `GuideCharacter` や主要 CTA のすぐ上に重なりすぎないか、実機幅（375px / 1280px）で見た目を確認してください。既存のしるべ（立ち絵）と同じ画面に出す場合は、どちらかを控えめにしてください。
- **master へのマージ**: 本番反映（`master` へのマージ・デプロイ）は必ずオーナー確認を経て行ってください。試作用デモ（`/demo/shirube`）を本番に公開したくない場合は、マージ前にデモルートを外すか `NON_CORE_DISALLOW` / `NOINDEX_ROBOTS` の維持を確認してください。
