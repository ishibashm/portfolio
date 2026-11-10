# 2026-11-10 DB一時障害時のISR控え（壊れた404 / 空canonical）

秘密の値は書かない。本番マージ・デプロイは未実施。

## 背景
2026-11-09〜10 に DB（Supabase）が止まっていた間、`/blog/[slug]` の ISR 控えに壊れた結果が残った。
404、または 200 で canonical がトップ（layout の `alternates.canonical "/"`）になるページが `x-nextjs-cache: STALE` で配られた。

## 原因
`loadBlogPost` / `loadSearchableBlogPosts` が DB 例外を握りつぶして Markdown に落ち、Markdown にも無い（DB 専用の大多数の）記事を `undefined` / 空配列として返していた。
ページ側はそれを「記事が無い」とみなし、`notFound()` や空の metadata を ISR に書いていた。接続障害と「本当に無い」が区別されていなかった。

## 対応（下書きPR）
- PR: https://github.com/ishibashm/portfolio/pull/1800
- ブランチ: `codex/isr-db-outage-cache-2026-11-10`
- コミット: `c0328299`
- 実装は box 上の Codex CLI（`codex exec`）

- `src/lib/blogStore.ts`：既知の接続・タイムアウト障害は例外を伝播。Markdown にある記事は障害時も Markdown で本文と metadata を出す。表未適用は従来の Markdown フォールバックを残す。
- `src/app/blog/[slug]/page.tsx`：関連記事の取得失敗時は関連記事だけ省き、本文・metadata は維持。
- `/blog` 一覧と RSS も同じ取得層を通る。`/houi` 本体は DB 取得が無く変更なし。

## 確認
- 作業ツリー: `npm test` 6525 成功・5 skip、lint エラー 0、`tsc --noEmit` 成功
- CI は PR #1800 で確認

## 残る懸念
- 既存の壊れた ISR 控えはこの PR では消えない（アクセスで作り直されるか、デプロイで入れ替わるまで残る可能性）
- 正常な控えの無い初回アクセスは、障害中にエラーになり得る
- 判定に載っていない障害形式は従来の Markdown フォールバックになる
