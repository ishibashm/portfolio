# Launcher Domain (Portal / Hub)

## 役割と範囲
- ポータル画面 (`/`, `/dashboard`)
- 共通プロファイル設定・共通コンテキスト (`user_configs`, `PersonalProfileConfig`)
- 全サブドメインへのナビゲーション・統合Telemetry表示
- エージェントアクティビティ・共通設定

## ディレクトリ構造
- `components/`: ランチャー専用コンポーネント (アプリ一覧カード, 統合ダッシュボードなど)
- `services/`: 共通データ・ポータル用データ取得サービス
