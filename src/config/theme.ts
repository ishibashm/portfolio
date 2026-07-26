/**
 * ====================================================================
 * 🎨 My-Portfolio 統一デザインテーマ設定ファイル (Central Theme Config)
 * ====================================================================
 * 
 * 画面のデザイン（カラー・背景グラデーション・カードの透明度・影・角丸など）を
 * 変更したい場合は、このファイルの値を編集するだけでアプリ全体が一括更新されます。
 */

export interface ThemeConfig {
  primaryColor: string;       // メインアクセントカラー (ボタン・ハイライト)
  primaryHover: string;       // メインカラーのホバー時
  secondaryColor: string;     // セカンダリカラー (バッジ・サブ要素)
  
  pageBackground: string;     // ページ全体の背景グラデーション/カラー
  cardBackground: string;     // カード・パネルの背景 (RGBAで透明度調整可)
  cardBorder: string;         // カードの境界線カラー
  cardShadow: string;         // カードの影
  
  textHeading: string;        // 大見出し・タイトル文字色 (高コントラスト)
  textBody: string;           // 本文・一般テキスト文字色 (高コントラスト)
  textMuted: string;          // 補足・注釈テキスト文字色 (高視認性)
  
  glassBlur: string;          // すりガラスのボカシ強度
  borderRadius: string;       // カードの角丸サイズ
  fontFamilyHeader: string;   // 見出しフォント
}

// --------------------------------------------------------------------
// 🌟 テーマプリセット一覧
// --------------------------------------------------------------------
export const themePresets: Record<string, ThemeConfig> = {
  /**
   * 1. 🌟 High Contrast Warm (★高視認性・文字がくっきり見える暖かみのあるテーマ)
   */
  highContrastWarm: {
    primaryColor: "rgb(225 29 72)",        // Rose-600 (深みのあるローズ)
    primaryHover: "rgb(190 18 60)",        // Rose-700
    secondaryColor: "rgb(217 119 6)",      // Amber-600
    pageBackground: "linear-gradient(to bottom right, #faf7f5, #f5efe9, #f0e9e1)",
    cardBackground: "rgba(255, 255, 255, 0.95)", // 高不透明度で文字を浮き立たせる
    cardBorder: "rgba(203, 213, 225, 0.9)", // Slate-200/90 の引き締まった境界線
    cardShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)",
    textHeading: "#0f172a",                 // Slate-900 (極めて濃厚な黒・濃紺)
    textBody: "#1e293b",                    // Slate-800 (ハッキリ読める濃色)
    textMuted: "#334155",                   // Slate-700 (補足もくっきり視認)
    glassBlur: "backdrop-blur-md",
    borderRadius: "rounded-2xl",
    fontFamilyHeader: "font-serif",
  },

  /**
   * 2. 🌸 Warm Glass (ソフトウォーム)
   */
  warmGlass: {
    primaryColor: "rgb(244 63 94)",        // Rose-500
    primaryHover: "rgb(225 29 72)",        // Rose-600
    secondaryColor: "rgb(245 158 11)",     // Amber-500
    pageBackground: "linear-gradient(to bottom right, #fdfbf7, #fff5f5, #fef2f2)",
    cardBackground: "rgba(255, 255, 255, 0.9)",
    cardBorder: "rgba(226, 232, 240, 0.8)",
    cardShadow: "0 20px 25px -5px rgba(226, 232, 240, 0.4)",
    textHeading: "#0f172a",                 // Slate-900
    textBody: "#1e293b",                    // Slate-800
    textMuted: "#475569",                   // Slate-600
    glassBlur: "backdrop-blur-xl",
    borderRadius: "rounded-3xl",
    fontFamilyHeader: "font-serif",
  },

  /**
   * 3. 🌙 Midnight Dark (クールでスタイリッシュなダークテーマ)
   */
  midnightDark: {
    primaryColor: "rgb(99 102 241)",       // Indigo-500
    primaryHover: "rgb(79 70 229)",        // Indigo-600
    secondaryColor: "rgb(168 85 247)",     // Purple-500
    pageBackground: "linear-gradient(to bottom right, #09090b, #0c0a09, #111827)",
    cardBackground: "rgba(24, 24, 27, 0.85)",
    cardBorder: "rgba(255, 255, 255, 0.15)",
    cardShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
    textHeading: "#f8fafc",                 // Slate-50
    textBody: "#cbd5e1",                    // Slate-300
    textMuted: "#94a3b8",                   // Slate-400
    glassBlur: "backdrop-blur-xl",
    borderRadius: "rounded-2xl",
    fontFamilyHeader: "font-sans",
  },
};

// ====================================================================
// ⚙️ 【ここでアクティブなテーマを選択します】
// ====================================================================
// 選択肢: "highContrastWarm" | "warmGlass" | "midnightDark"
export const activePresetKey: keyof typeof themePresets = "highContrastWarm";

// 現在選択されているテーマ設定
export const currentTheme: ThemeConfig = themePresets[activePresetKey];
