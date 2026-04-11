# Dashboard Restructure (Temporal & Spatial)

現在の3タブ構成（Overview, Diagnostics, Map）を、ご提案の通り「時間軸」と「空間軸」に沿って機能的に再構成します。またSYS.5のHUD表記にもコントラスト（線種のプログラム設定値の明記など）を強化します。

## 変更の狙い
関連するコントロール（時間を操作するUIと時計、空間を操作するUIとマップ）を同じ画面にまとめることで、ユーザーの操作動線を直感的にします。

## Proposed Changes

### Dashboard State & Layout
現在のタブ状態 `overview`, `diagnostics`, `map` を以下の3つに変更します。
1. **Temporal (時間)**
2. **Spatial (空間)**
3. **Diagnostics (診断/設定)**

#### [MODIFY] `src/components/SolarTimeClock.tsx`
*   **状態・タブ定義の変更**:
    *   `setActiveTab<"temporal" | "spatial" | "diagnostics">("temporal")` に変更。
    *   上部のナビゲーションボタンを更新。
*   **Temporalタブの中身**:
    *   [継続] `TacticalActionCommand`
    *   [継続] Temporal Navigation (時間スライダー)
    *   [継続] `ClockDisplay`
    *   [継続] `BioMagneticDashboard`
    *   [移動元(overview)] `SolarTimeTable` (時間のフィルタマトリクス)
*   **Spatialタブの中身**:
    *   [移動元(overview)] Spatial Targeting (目的地緯度経度・ActionIntent設定パネル)
    *   [継続] `TacticalMagneticMap`
*   **Diagnosticsタブの中身**:
    *   既存のまま (`PersonalProfileConfig` と生データ)

#### [MODIFY] `src/components/TacticalMagneticMap.tsx`
*   SYS.5 コントラスト強化: 
    *   各ステータスの説明テキストに、線のパターン（`dashArray` の設定値）をサイバーパンクなメタデータとして明記し、UI全体の表現力を強化します。

## User Review Required
> [!IMPORTANT]
> 「Spatial Targeting（目的地設定）」のパネルを「空間(Spatial)」タブ（マップと同じ場所）に移動します。
> これにより、目標緯度経度を入力しながらすぐに真下のマップで磁気ノイズを確認できるようになります。
> この構成案で進行してよろしいでしょうか？
