# Global Control Layout Restructuring

## 課題 (Problem)
現在、時間スライダー（Temporal Navigation）が「Temporal」タブの内部に配置されていますが、これによって変化する値（目的地の安全性、地図上のベクトル描画）を見るためには「Spatial」タブへ切り替える必要があり、リアルタイムな変化（時間が進むとマップがどう変わるか）を直感的に確認できないというユーザビリティ上の課題があります。

## 解決策 (Proposed Changes)

時間スライダー（Time Offset）や時刻状態（Temporal Navigation）は特定タブに依存する情報ではなく**「ダッシュボード全体の環境シミュレーション状態」を規定するグローバルなコントロール**として扱うべきです。

### 変更予定のコンポーネント: `src/components/SolarTimeClock.tsx`

1. **グローバルコントロール化**
   - 時間スライダー（Temporal Navigation）のブロックを、タブの表示切り替えロジック（`{activeTab === 'temporal' && ...}`）の**外側（タブの上部、または全タブ共通のヘッダー直下）へ移動**させます。
   - これにより、ユーザーは **地図（Spatial タブ）を見ながら時間スライダーをスクラブ（左右に動かす）して、未来・過去のベクトルの変化をリアルタイムで確認できる** ようになります。

2. **TacticalActionCommand の併合（オプション）**
   - 現在 Temporal タブにある `TacticalActionCommand` (アクション指針のHUD) も、空間状況・生体状況に基づくグローバルアラートであるため、時間スライダーと共にグローバル領域（画面上部）に配置することを推奨します。

### 変更イメージ階層

```text
[ ユーザープロファイル・設定 ヘッダー部分 ]
[ Navigation Tabs (Temporal / Spatial / Diagnostics) ]

↓ 新配置（全タブでここが表示される）
=========================================
[ Tactical Action Command (グローバル警告) ]
[ Temporal Navigation (時間軸操作スライダー)]
=========================================

↓ 各タブの中身
Temporal専用コンテンツ (ClockDisplay, BioMagneticDashboard, SolarTimeTable)
------------- OR -------------
Spatial専用コンテンツ (Spatial Targeting, ゾーン判定, TacticalMagneticMap)
------------- OR -------------
Diagnostics専用コンテンツ (ユーザー設定, RAW Matrix)
```

## User Review Required

> [!IMPORTANT]
> スライダーと現在のアクション指針のアラートを、タブ切り替えによらず「常に画面上部に表示して操作可能にする」という構成で進めてよろしいでしょうか？
> もし「スライダー自体はSpatialタブの中（地図の真横）に入れてほしい」といった別の要望があればお知らせください。
