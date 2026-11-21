# しるべ歩き回り（`ShirubeWanderer`）の本番組み込み手順

この試作は `feat/shirube-wander` ブランチのデモ（`/demo/shirube`）に閉じ込めてあり、本番のトップページや共通レイアウトにはまだ組み込んでいません。後から本番サイトへ載せる場合は、以下の手順と注意点を確認したうえで進めてください。

## 1. インポートするファイル

```tsx
import { ShirubeWanderer } from "@/components/guide/ShirubeWanderer";
```

- 表示には既存の `GuideAvatar`（`src/components/guide/GuideCharacter.tsx`）の `pose="pointing"` を使います（`srcset` / `sizes` / `loading="lazy"` を維持、`float` はオフ）。
- デフォルメ版（`shirube-chibi-*`）は使いません。

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
- **サイズとスマホ配慮**: `GuideAvatar` の `size="sm"` に `max-w-14 sm:max-w-20`（スマホ幅 56px / sm 以上 80px）を重ねています。本文や下部 CTA に大きく被らないサイズを維持してください。
- **prefers-reduced-motion**: 本番の既定（`forceReducedMotion` 未指定）は OS の `prefers-reduced-motion: reduce` を自動判定し、reduce 時は `requestAnimationFrame` を回さず画面下端の右寄り（`restSide` で変更可）に静止表示します。本番では `forceReducedMotion` を固定指定しないでください。
- **トップや主要 CTA・既存しるべとの重複**: トップの「しるべに案内してもらう」など既存の `GuideCharacter` や主要 CTA のすぐ上に重なりすぎないか、実機幅（375px / 1280px）で見た目を確認してください。`float`（`motion-float`）は歩き回りと競合するため併用しません。
- **master へのマージ**: 本番反映（`master` へのマージ・デプロイ）は必ずオーナー確認を経て行ってください。試作用デモ（`/demo/shirube`）を本番に公開したくない場合は、マージ前にデモルートを外すか `NON_CORE_DISALLOW` / `NOINDEX_ROBOTS` の維持を確認してください。
