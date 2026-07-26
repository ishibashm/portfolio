/**
 * ====================================================================
 * 🎨 My-Portfolio 統一デザインテーマ設定ファイル (Central Theme Config)
 * ====================================================================
 * 
 * 画面のデザイン（カラー・背景グラデーション・カードの透明度・影・角丸など）を
 * 変更したい場合は、このファイルの値を編集するだけでアプリ全体が一括更新されます。
 * 
 * 【使い方】
 * 1. プリセットテーマを変更したい場合：
 *    `activePreset` の値を '"warmGlass"' から '"midnightDark"' や '"emeraldMint"' に書き換えます。
 * 
 * 2. 独自の色やスタイルにカスタマイズしたい場合：
 *    `customTheme` オブジェクト内のカラーコード(#HEX)や数値を直接変更してください。
 */

export interface ThemeConfig {
  // 基本カラー
  primaryColor: string;       // メインアクセントカラー (ボタン・ハイライト)
  primaryHover: string;       // メインカラーのホバー時
  secondaryColor: string;     // セカンダリカラー (バッジ・サブ要素)
  
  // 背景スタイル
  pageBackground: string;     // ページ全体の背景グラデーション/カラー
  cardBackground: string;     // カード・パネルの背景 (RGBAで透明度調整可)
  cardBorder: string;         // カードの境界線カラー
  cardShadow: string;         // カードの影
  
  // テキストカラー
  textHeading: string;        // 大見出し・タイトル文字色
  textBody: string;           // 本文・一般テキスト文字色
  textMuted: string;          // 補足・注釈テキスト文字色
  
  // 装飾・グラスフィニッシュ
  glassBlur: string;          // すりガラスのボカシ強度 (例: 'backdrop-blur-xl')
  borderRadius: string;       // カードの角丸サイズ (例: 'rounded-3xl')
  fontFamilyHeader: string;   // 見出しフォント (例: 'font-serif', 'font-sans')
}

// --------------------------------------------------------------------
// 🌟 テーマプリセット一覧 (切り替えて試せます)
// --------------------------------------------------------------------
export const themePresets: Record<string, ThemeConfig> = {
  /**
   * 1. 🌸 Warm Glass (現在デフォルト: 親しみやすいウォームクリーム＆パステルローズ)
   */
  warmGlass: {
    primaryColor: "rgb(244 63 94)",        // Rose-500 (#f43f5e)
    primaryHover: "rgb(225 29 72)",        // Rose-600
    secondaryColor: "rgb(245 158 11)",     // Amber-500
    pageBackground: "linear-gradient(to bottom right, #fdfbf7, #fff5f5, #fef2f2)",
    cardBackground: "rgba(255, 255, 255, 0.85)",
    cardBorder: "rgba(254, 205, 211, 0.8)",  // Rose-100/80
    cardShadow: "0 20px 25px -5px rgba(254, 205, 211, 0.35)",
    textHeading: "#1c1917",                 // Stone-900
    textBody: "#44403c",                    // Stone-700
    textMuted: "#78716c",                   // Stone-500
    glassBlur: "backdrop-blur-xl",
    borderRadius: "rounded-3xl",
    fontFamilyHeader: "font-serif",
  },

  /**
   * 2. 🌙 Midnight Dark (クールでスタイリッシュなダークテーマ)
   */
  midnightDark: {
    primaryColor: "rgb(99 102 241)",       // Indigo-500 (#6366f1)
    primaryHover: "rgb(79 70 229)",        // Indigo-600
    secondaryColor: "rgb(168 85 247)",     // Purple-500
    pageBackground: "linear-gradient(to bottom right, #09090b, #0c0a09, #111827)",
    cardBackground: "rgba(24, 24, 27, 0.75)",
    cardBorder: "rgba(255, 255, 255, 0.12)",
    cardShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
    textHeading: "#f8fafc",                 // Slate-50
    textBody: "#cbd5e1",                    // Slate-300
    textMuted: "#64748b",                   // Slate-500
    glassBlur: "backdrop-blur-xl",
    borderRadius: "rounded-2xl",
    fontFamilyHeader: "font-sans",
  },

  /**
   * 3. 🌿 Emerald Mint (爽やかで自然なエメラルドグリーンテーマ)
   */
  emeraldMint: {
    primaryColor: "rgb(16 185 129)",       // Emerald-500 (#10b981)
    primaryHover: "rgb(5 150 105)",        // Emerald-600
    secondaryColor: "rgb(20 184 166)",     // Teal-500
    pageBackground: "linear-gradient(to bottom right, #f0fdf4, #ecfdf5, #f0fdfa)",
    cardBackground: "rgba(255, 255, 255, 0.88)",
    cardBorder: "rgba(167, 243, 208, 0.8)", // Emerald-100
    cardShadow: "0 20px 25px -5px rgba(167, 243, 208, 0.4)",
    textHeading: "#064e3b",                 // Emerald-950
    textBody: "#047857",                    // Emerald-700
    textMuted: "#10b981",                   // Emerald-500
    glassBlur: "backdrop-blur-xl",
    borderRadius: "rounded-3xl",
    fontFamilyHeader: "font-sans",
  },

  /**
   * 4. 🌅 Sunset Amber (温かみのあるアンバー・オレンジグラデーション)
   */
  sunsetAmber: {
    primaryColor: "rgb(245 158 11)",       // Amber-500 (#f59e0b)
    primaryHover: "rgb(217 119 6)",        // Amber-600
    secondaryColor: "rgb(249 115 22)",     // Orange-500
    pageBackground: "linear-gradient(to bottom right, #fffbeb, #fef3c7, #fff7ed)",
    cardBackground: "rgba(255, 255, 255, 0.9)",
    cardBorder: "rgba(253, 230, 138, 0.8)", // Amber-200
    cardShadow: "0 20px 25px -5px rgba(253, 230, 138, 0.4)",
    textHeading: "#451a03",                 // Amber-950
    textBody: "#78350f",                    // Amber-900
    textMuted: "#b45309",                   // Amber-700
    glassBlur: "backdrop-blur-xl",
    borderRadius: "rounded-3xl",
    fontFamilyHeader: "font-serif",
  },
};

// ====================================================================
// ⚙️ 【ここでアクティブなテーマを選択します】
// ====================================================================
// 選択肢: "warmGlass" | "midnightDark" | "emeraldMint" | "sunsetAmber"
export const activePresetKey: keyof typeof themePresets = "warmGlass";

// 現在選択されているテーマ設定
export const currentTheme: ThemeConfig = themePresets[activePresetKey];
