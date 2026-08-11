# AI Agent Harness: Roadmap & Architecture Design

## 1. 現状のワークスペースの問題点 (Current Issues)
これまでのセッション（UIコンポーネント組み込みエラーや型エラー）と、参照したドキュメント（ハーネス設計論、最新AIスキル）から導き出される本プロジェクトの主要な問題点は以下の通りです。

1. **品質検証の欠如（テストフレームワークの不在）**
   - **症状:** AIが「完了しました」と宣言しても、実際には型エラーや実行時エラーが発生する（直近のPropsの不一致エラー等）。
   - **原因:** `review-harness.mjs` の診断でも0点となった通り、客観的に動作を担保するテスト（Jest / Vitest 等）が存在せず、AIの思い込みによるコミットを防ぐ物理的ストッパーがない。
2. **継続的インテグレーション（CI）の未整備**
   - **症状:** 破壊的変更がそのままマージされ、本番環境（またはローカル開発環境）を壊すリスクがある。
   - **原因:** GitHub Actions等のCIパイプラインによる、PR時の自動Lint/Test/Buildフックが弱い（または存在しない）。
3. **自律的エラーリカバリの仕組み不足**
   - **症状:** 文字列置換のエラー（Edit失敗）などを人間が手動でリカバリする手間が発生する。
   - **原因:** AI自身が `npm run lint` や `npx tsc`、`npm test` をトリガーとして自律的にエラーを察知・修正する「Review Skill」の自動実行フローが徹底されていない。

---

## 2. アーキテクチャ設計 (Harness Architecture Design)
これらの問題を解消し、AIエージェントが「確実に動くコード」だけを生成する環境を構築します。

### A. ルール層 (Rule Layer)
- `CLAUDE.md`: 技術スタックと絶対的な禁止事項（推測によるコード編集の禁止など）。**（実装済）**
### B. コンテキスト層 (Context Layer)
- `MEMORY.md`: 現在の実装状況とNext Steps。**（実装済）**
### C. スキル層 (Skill Layer)
- `.roo/skills/*.md`: Plan, Review, Quant-Research のプロシージャ。**（実装済）**
### D. フック層 (Hook / Validation Layer) **【今回実装】**
- **Unit Testing (Vitest + React Testing Library):** UIコンポーネントとAPIルートの単体テストを導入。AIは実装後に必ずこれをパスさせる義務を負う。
- **CI/CD (GitHub Actions):** プルリク/Push時に自動でLint・TypeCheck・Test・Buildを走らせるゲートウェイを構築。

---

## 3. ロードマップと実装ステップ (Implementation Roadmap)

### Phase 1: テスト基盤の導入（Immediate Action）
- [x] Vitest, React Testing Library, jsdom のインストール。
- [x] `vitest.config.ts` の作成と Next.js 向けの設定。
- [x] `package.json` への `"test"` スクリプト追加。
- [x] サンプルテスト（または既存コンポーネントの基本テスト）の作成。

### Phase 2: CIパイプラインの構築（Immediate Action）
- [x] `.github/workflows/ci.yml` の作成。
- [x] Node.js環境のセットアップ、依存解決、Lint、Test、Build の自動実行フロー構築。

### Phase 3: エージェント自律サイクルの確立（Ongoing）
- [ ] AIエージェントがタスク完了前に `npm test` と `npx tsc --noEmit` を自己実行し、エラーがゼロになるまで自律修正するフローの定着（Review Skillの徹底）。
- [ ] ハーネス診断ツール (`review-harness.mjs`) での **Score: 100 (Grade: S)** の達成。