# 案内役AI（自由質問）評価スクリプト

`/annai/ask` の自由質問エージェントループ（`answerFreeQuestion`）に 30 問の質問セット（`questions.json`）を通し、回答のステータス・照合後の文・記事リンク・消費ニューロン数・所要時間を記録します。

## 注意事項

- このスクリプトは Cloudflare Workers AI の REST API を実際に呼び出し、**1日 10,000 neurons の無料枠を消費します**。
- **サイト所有者の承認がある場合にのみ、手動で実行してください。**
- CI や自動テストからは実行しないでください。

## 必要な環境変数

- `ANNAI_EVAL_CONFIRM=yes`（手動実行の確認フラグ。未設定時は即座に終了します）
- `GUIDE_AI_ENABLED=true`
- `GUIDE_AI_PROVIDER=workers-ai`
- `CLOUDFLARE_WORKERS_AI_ACCOUNT_ID`（32桁の16進文字列）
- `CLOUDFLARE_WORKERS_AI_TOKEN`
- `GUIDE_SESSION_KEY`（32バイトのbase64文字列）

## 実行手順（承認後のみ）

```bash
ANNAI_EVAL_CONFIRM=yes npx tsx scripts/annai-eval/run.ts
```

出力は `scripts/annai-eval/out/`（Git 管理外）に JSON と Markdown で保存されます。
