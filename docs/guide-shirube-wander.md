# しるべ歩き回り（`ShirubeWanderer`）の本番組み込み手順

この試作は `feat/shirube-wander` ブランチのデモ（`/demo/shirube`）に閉じ込めてあり、本番のトップページや共通レイアウトにはまだ組み込んでいません。後から本番サイトへ載せる場合は、以下の手順と注意点を確認したうえで進めてください。

## 1. インポートするファイル

```tsx
import { ShirubeWanderer } from "@/components/guide/ShirubeWanderer";
```

- 表示は部品分けしたちびしるべ `ShirubeWalkRig`（`src/components/guide/ShirubeWalkRig.tsx`）です。素材は `public/guide/walk/` の 3 枚（`leg-far`・`leg-near`・`body`、各 128px / 240px の WebP と PNG、合計 100KB 未満）。
- 3 枚は同じキャンバス寸法（原寸 517×1063）なので重ねるだけで位置が合います。足は袴の裾に隠れた付け根を軸に CSS の `rotate` で振り、付け根より上は袴の内側まで足を伸ばしてあるので隙間は出ません。
- 元絵は右向きです。左へ歩くときだけ `scaleX(-1)` で反転します。
- 素材の作り直し: `/workspace/shirube-walk/build_rig.py`（背景抜き＝rembg isnet-anime → 部品分け）と `render.py`（プレビューと keyframes の値）。共有パソコン上の作業用で、リポジトリには入れていません。

## 1-2. 動きの中身

- 歩行中（`data-state="walking"`）: 手前と奥の足を ±24° で交互に振り、振り出す足を少し持ち上げる。体は 1 サイクルに 2 回はずむ（PC で約 2.6px）。体はわずかに前傾して揺れる。
- 1 サイクルは PC 1.08 秒・スマホ 1 秒（CSS 変数 `--shirube-cycle`）。歩く速さ（PC 26px/秒・スマホ 14px/秒）と一歩の長さを合わせて、足が地面を滑って見えないようにしてあります。表示の高さを変えるときは `--shirube-h` と速さを一緒に変えてください（速さ ≒ 高さ × 0.234 ÷ サイクル秒）。
- 立ち止まり・振り返り中: 足をそろえ、胴体だけゆっくり呼吸する。
- `prefers-reduced-motion: reduce`: アニメーションなし。右下で足をそろえて立つ。

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
