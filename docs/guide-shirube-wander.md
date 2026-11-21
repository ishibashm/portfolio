# しるべ自由歩き回り＆自動案内（`ShirubeWanderer`）ガイド

共通レイアウト（`src/app/layout.tsx`）に `<SiteShirube />` を 1 回だけ置き、実際のページを歩き回って案内します。管理画面・ログイン・API 系（`/admin` `/auth` `/login` `/mcp` `/api`）には出しません。試作の `/demo/shirube` は本番に残さないため削除しました。確認は `npm run dev` で実際のページ（`/`・`/houi/today`・記事・404 など）を開いて行います。

## 1. 構成ファイル

| ファイル                                     | 役割                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/components/guide/ShirubeWanderer.tsx`   | 画面全体の自由移動と自動案内を統合するメインコンポーネント                      |
| `src/components/guide/shirubePerch.ts`       | 床（perch）の検出（純粋関数 `findPerches` + DOM 収集 `collectPerchCandidates`） |
| `src/components/guide/shirubeWanderLogic.ts` | 移動・ジャンプ・休止・指さしの純粋状態マシン（`random` 注入可能）               |
| `src/components/guide/shirubeTips.ts`        | ルート別の案内辞書・対象探索 `resolveTipTarget`・頻度制御 `canShowAutoTip`      |
| `src/components/guide/ShirubeBubble.tsx`     | 吹き出し UI（白地・紺文字・金枠）と非表示時の右下タブ                           |
| `src/components/guide/ShirubeWalkRig.tsx`    | 部品分けちびしるべ（横向き・正面）                                              |
| `src/components/guide/SiteShirube.tsx`       | レイアウトから置く入口（出さない画面の判定・後から読み込み）                    |
| `src/components/guide/shirubeBubblePlace.ts` | 吹き出しの置き場所選び（ボタン・リンクに重ねない）                              |
| `src/components/guide/ShirubeShuffle.tsx`    | 4 コマすり足スプライト（WebP + PNG フォールバック）                             |
| `src/components/guide/ShirubeWanderer.css`   | ステージ・歩行・ジャンプ・振り返り・吹き出しのスタイル                          |

## 2. 自由歩き回り（フリーローミング）と床（Perch）

- **自律ランダム移動**: 利用者による移動操作（ドラッグや「ここに来て」メニューなど）は持たず、しるべが自分で歩き回ります。キャラをタップしたときは「今のページの案内・次の一歩」だけを表示します。
- **フェーズ（`data-state`）**:
  - `walking`: 現在の床の上を歩く（PC 26px/秒・スマホ 14px/秒、すり足は 16 / 9 px/秒。負の `animation-delay` により静止時の 0° から滑らかに踏み出す）。
  - `paused`: 立ち止まってときどき周囲を見渡す。
  - `turning`: 向きを変える短い間。正面から横向きに戻る際は `is-turning-back` クラスで小さく弾む。
  - `greeting`: 正面を向いて手を振る。
  - `sitting`: 床の上で正面ポーズのまま静かに呼吸してひと休み。
  - `hopping`: 床 A から床 B へ放物線（所要 450〜700ms、頂点は高い方の床より 40〜90px 上）で飛び移る。踏み切り・着地（`is-landing`）で伸縮アニメーションを行う。
  - `pointing`: 対象の近くに立ち、正面の絵で対象の側の手を挙げて「こちら」と示す（公式の指さし立ち絵は頭身が違うため、歩き回りでは使わない）。対象には金色の輪郭を約 2.5 秒だけ付ける。
- **行動の多様化**: 直近 3 回の行動履歴と直前の床 ID を記憶し、同じ行動・同じ床の連続を避けます。
- **要素の床に長居しない**: 画面下端以外の要素の床では左右 20% の端を優先して立ち、連続滞在が約 8 秒を超えると自動で別の床へ移ります。スクロール等で床が画面外に出た・消えた場合は最寄りの可視床（最下端フォールバック）へ飛び降ります。

### 床の検出ルール（`shirubePerch.ts`）

- 画面最下端（`id: "bottom"`）は常に床として含みます。画面下の固定 CTA（`[data-shirube-avoid]` や下端の `fixed / sticky` 操作要素）と `safe-area-inset-bottom` を避けて持ち上げます。
- 追加の床は明示属性 `[data-shirube-perch]` と既定セレクタ（`main h2`, `main article`, `main section[class*="rounded"]`, `main section > div[class*="rounded"]`, `main .wg-card`）から自動検出します。ボタンやリンクは文字を隠しやすく押す邪魔にもなるので、既定では床にしません（必要なら `data-shirube-perch` を付けます）。
- 以下の要素は床から除外し、上にも重なりません:
  - 非表示要素、ステージ内要素、`[data-shirube-avoid]` 内要素
  - `button[type="submit"]`、`[data-primary-cta]`、フォーカス中の入力欄
  - 画面上端から「キャラの高さ + 16px」より上にある要素（頭が切れるため）
- **上が空いている所だけ**: 床の上、しるべの背丈 + 10px の範囲を `elementFromPoint` で 14px おきに調べ、文字・画像・ボタン・色や枠の付いた箱（上のカードなど）が無い横の区間だけを床にします。区間が狭い（しるべの幅 + 16px 未満）・空きが無いカードは使いません。カードが隙間なく縦に並ぶページでは、画面下端だけを歩きます。
- **固定サイドバー**: PC で左に固定のメニューがあるときは、本文（`main`）の左端より右だけを歩きます。
- **ページ側のしるべと並ばない**: トップの指さしなど、ページにもともと描かれた大きなしるべ（`/guide/shirube-*` の画像、高さ 64px 以上）が 3 割以上見えている間は、歩き回るしるべは姿を消し、自動の案内も出しません。
- **上限**: PC は最大 12 か所（幅 120px 以上）、スマホ（`< 640px`）は最大 4 か所（幅 200px 以上のみ）。

## 3. 自動ガイド（案内辞書とページごとの追加方法）

案内文は `src/components/guide/shirubeTips.ts` にまとめています。すべて 40 文字以内のやさしい日本語で、実在ルートに前方一致で対応します。

### ページ側に目印を足す場合（任意）

既存ページを編集しなくても見出しテキストやセレクタから自動で見つけますが、ピンポイントに指さしたい要素へ `data-shirube-tip="<tipId>"` を付けると最優先で参照されます。

```tsx
<section data-shirube-tip="today-lucky">...</section>
<div data-shirube-result data-verdict="good">南東：吉</div>
<div data-empty-state>まだ候補がありません</div>
<article data-shirube-perch="featured-card">...</article>
```

対象の解決順（`resolveTipTarget`）:

1. `[data-shirube-tip="<id>"]`
2. チップの `target.selector`
3. チップの `target.headingText` を含む見出し（`main h1/h2/h3`）
4. 最初の `main h1`（`allowH1Fallback: false` の場合は省略）

### トリガーと頻度制限

| トリガー | 発火タイミング                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `enter`  | ページ表示から約 6〜10 秒後（空状態が見えていれば `empty` を優先）                                                          |
| `scroll` | 新しいセクションへスクロールして落ち着いた後（600ms デバウンス）                                                            |
| `result` | `[data-shirube-result]` または「吉」「凶」を含む `[data-verdict]` が新しく現れたとき（`MutationObserver` 250ms デバウンス） |
| `idle`   | 45 秒無操作（未入力の必須入力欄が見えていれば「次はここを入力してください」を優先）                                         |
| `empty`  | `[data-empty-state]` が画面内に入ったとき                                                                                   |

- **頻度制限**: 自動表示は最小 45 秒間隔、1 ページ表示あたり最大 6 回まで。同じチップは自動では繰り返しません。
- **結果への反応は優先**: `result`（吉凶が出た）だけは、直前に別の案内が出ていても出します。ただし続けざまにならないよう、前の案内から最低 10 秒は空けます。
- **指さしの動き方**: 対象が別の床の近く（横 380px 以内）なら跳んで行って指さします。同じ床で離れているとき・遠すぎるときは、跳ばずにその場で対象の方を向いて手を挙げます。
- **入力中の配慮**: `input` / `textarea` / `select` にフォーカスがある間は自動吹き出しを出しません。
- **自動スクロール禁止**: 閲覧を邪魔しないようページを自動スクロールせず、現在ビューポート内にある対象だけを指さします。
- **自動消去と縁取り**: 吹き出しは約 7 秒で自動で閉じます。対象要素にはレイアウトを変えない 2px の金枠（`.shirube-tip-target-highlight`）を約 2.5 秒付けます。

## 4. 吹き出し・休む（非表示）・呼び戻す

- **吹き出し**: 白背景・紺文字（`#1e2a5a`）・金枠（`#c9a54a`）。PC 最大幅 220px、スマホ最大幅 180px。置き場所は上（中央・左右寄せ）→横→下の順に試し、ボタン・リンク・入力欄に重ならない最初の場所を選びます（`chooseBubblePlacement`）。スマホではどこも重なるとき自動の案内は出さず、タップされたときだけ一番重なりの小さい場所に出します。PC は重ならない場所を優先しつつ出します。吹き出しは画面に固定なので、120px 以上スクロールしたら閉じます。`role="status"` / `aria-live="polite"` を付与。緑・赤は吉凶判定専用とし、吹き出し UI には使いません。
- **タップと Esc**: しるべ本体（`<button aria-label="しるべに話しかける">`）を押すと今のページの案内を表示します。`Escape` キーで吹き出しを閉じます。
- **休ませる／呼び戻す**: 吹き出し右上の `×` を押すと、しるべは画面右下の小さな丸タブ（28×28 紺円・`aria-label="しるべを呼ぶ"`）へ隠れます。状態は `localStorage` の `shirube:hidden`（`"1"` / 未設定）に保存され、タブを押すと復帰します。

## 5. `prefers-reduced-motion`・スマホ・パフォーマンス配慮

- **`prefers-reduced-motion: reduce`**: 移動・ジャンプ・CSS アニメーションをすべて止め、`requestAnimationFrame` も回さず右下（`restSide` で変更可）に正面ポーズで静止します。タップによる案内と自動吹き出し（＋対象の金枠）はそのまま機能します。
- **スマホ（`< 640px`）**: キャラ高さ 60px、床は最大 4 か所（幅 200px 以上）、吹き出し最大幅 180px、主要ボタンや下部固定 CTA を避けます。
- **pointer-events**: 外側の `.shirube-wander-stage` は常に `pointer-events: none`。キャラのボタン・吹き出し・復帰タブの最小領域のみ `pointer-events: auto` とし、本文や下層の操作を塞ぎません。
- **省電力・CLS ゼロ**:
  - `requestAnimationFrame` は `walking` と `hopping` の間だけ動かし、静止フェーズでは `setTimeout` で待機します。
  - `document.visibilityState === "hidden"` の間はループ・計測・監視をすべて停止します。
  - すべての `@keyframes` は `transform` と `opacity` のみを使い、`@media (prefers-reduced-motion: no-preference)` 内に閉じ込めています。

## 6. 組み込み方

`src/app/layout.tsx` の `<body>` の最後に、すでに置いてあります。

```tsx
import { SiteShirube } from "@/components/guide/SiteShirube";

<SiteShirube />; // 出さない画面は SHIRUBE_EXCLUDED_PREFIXES で管理
```

小物として単体で使う 4 コマすり足（`<ShirubeShuffle />`）も従来どおり利用できます。本番反映（`master` へのマージ）はオーナー確認を経て行ってください。
