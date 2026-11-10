# 2026-11-10 /houi/2027 年まとめ確認と公式LINE導線

秘密の値は書かない。本番マージ・デプロイは未実施。

## 1. 下書きPR #1795（/houi/[year]）

- URL: https://github.com/ishibashm/portfolio/pull/1795
- ブランチ: `codex/houi-2027-page`（master を取り込み済み、衝突なし）
- **結論: /houi/2027 を解決する（はい）**
  - `src/app/houi/[year]/page.tsx` が年まとめを描画
  - 本命星 1〜9 へのリンク `/houi/{year}/{star}` あり
  - `contentYears()` = 当年〜+2（2026時点で 2026/2027/2028）を `generateStaticParams`
  - next-sitemap の除外は `/houi/*/*/*`（月別）と area のみ。年ページ `/houi/2027` は対象外＝載る
  - ローカル: `houiYearPage.test.tsx` 5件成功、`tsc --noEmit` 成功、sitemapThinPages 7件成功
- 追加したもの: master 追従のマージコミットのみ（機能追加なし）。draft のまま

## 2. 公式LINE友だち追加（新規下書きPR）

- URL: https://github.com/ishibashm/portfolio/pull/1799
- ブランチ: `codex/line-friend-link-2026-11-10`
- 実装: Codex CLI（`codex exec`）。コミット・下書きPRは Grok Bot
- 定数: `src/lib/lineOfficial.ts` → `https://line.me/R/ti/p/@345fwcgj`
- 文言:「更新のお知らせをLINEで受け取る」
- 配置:
  - 全ページ: `SiteFooter` をルート layout に追加
  - `/houi/today`: 「日取りと共有」ナビ直後
- 外部リンク: `rel="noopener noreferrer"`、色は slate 系（LINE緑・判定色は未使用）
- 確認: lineFriendLink テスト 5件、`tsc --noEmit`、ESLint 成功

## 残作業（本人確認後）

- #1795 / #1799 のマージとデプロイ
- Cloud Palette 担当へ配置・文言の共有
