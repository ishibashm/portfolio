# 2026-11-10 削除URLの410と301転送（クリック復旧向け）

秘密の値は書かない。本番マージ・デプロイは未実施。

## 背景
Search Console の過去クリックがあったページのうち、いま 404 のものが5件あった。
データベース削除の影響ではなく、個人情報削除（#1733）や以前から閉じたページだった。

## 対応（下書きPR）
- PR: https://github.com/ishibashm/portfolio/pull/1798
- ブランチ: `codex/gone-and-redirects-2026-11-10`
- 実装は box 上の Codex CLI（`codex exec`）

| URL | 対応 |
|---|---|
| `/blog/moved-to-an-unlucky-direction` | 410（転送なし・#1733） |
| `/blog/one-birthdate-through-all-mcp-tools` | 410（同上） |
| `/blog/when-you-cannot-avoid-a-bad-direction` | 301 → `/blog/does-bad-direction-last-60-years` |
| `/calendar/2026-09` | 301 → `/calendar` |
| `/news` | 301 → `/blog`（RSS集約の直接後継は無し） |

## 実装メモ
- 410: `src/lib/gonePaths.ts` + `src/middleware.ts`（認証より前）
- 301: `next.config.ts` の `redirects()` に `statusCode: 301`
- テスト・lint・`tsc --noEmit` はブランチ上で成功

## 残作業（本人確認後）
- PR のマージとデプロイ
- Search Console: 個人情報削除2本の一時削除申請、転送先のインデックス登録
