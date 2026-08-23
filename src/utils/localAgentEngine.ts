export interface AgentThemeParams {
  background: string;
  foreground: string;
  accent: string;
  glowColor: string;
  glowIntensity: number;
  animationSpeed: string;
  fontTheme: "sans" | "serif";
  noiseOpacity: number;
  borderRadius: string;
}

/** ブログ投稿の下書き。`site_guardian_daemon` が DB へステージングする。 */
export interface AgentBlogPostArguments {
  title: string;
  content: string;
  tags: string;
  excerpt: string;
}

/**
 * 実行する道具。**名前ごとに引数の形が違う**ので、判別可能な union にする。
 *
 * 以前は `arguments: any` だった。受け取る側（`site_guardian_daemon`）は
 * `call.name === "set_color_theme"` で分けてから `args.background` などを
 * 読んでいるので、union にすればその分岐で形が確定する。
 */
export type AgentToolCall =
  | { name: "set_color_theme"; arguments: AgentThemeParams }
  | { name: "get_system_logs"; arguments: { limit: number } }
  | { name: "write_blog_post"; arguments: AgentBlogPostArguments };

export interface AgentDecisionResult {
  status: string;
  thoughtProcess: string;
  actions: string;
  textResponse: string;
  toolCalls: AgentToolCall[];
}

/**
 * Native TypeScript local engine that replaces python runner and Gemini API.
 * Generates spatial/solar alignment themes and reacts to user chat commands deterministically.
 */
/** 監視から渡ってくるログの 1 行。**読む枝だけ**を写す（CLAUDE.md 3 節）。 */
export interface AgentLogEntry {
  timestamp?: string | Date;
  triggerType?: string;
  status?: string;
  details?: string;
}

/**
 * 判断の材料。**この関数が実際に読む枝だけ。**
 *
 * 呼ぶ側（`site_guardian_daemon`）は「形は決めずに素の JSON として持つ」
 * 方針なので、どれも省略可。実装も `typeof ... === "number"` で確かめて
 * から使い、無ければ既定値に落ちる。
 */
export interface AgentSignals {
  systemLogs?: AgentLogEntry[];
  solarAzimuth?: number;
  solarElevation?: number;
  declination?: number;
}

export function getLocalAgentDecision(
  trigger: string,
  details: string,
  value: AgentSignals = {},
): AgentDecisionResult {
  let actions = "一般的なメンテナンス";
  let thought =
    "現在のイベントを感知しました。空間アライメントおよび物理的テレメトリデータに基づき、システムの保護およびビジュアルグリッドの最適化を行います（※ローカルエンジン）。";
  const toolCalls: AgentToolCall[] = [];
  let textResponse = `【エージェント応答】${trigger} を検知しました。調整を提案・実行します。`;

  // Default theme
  const theme: AgentThemeParams = {
    background: "#0a0a0a",
    foreground: "#ededed",
    accent: "#10b981",
    glowColor: "#10b981",
    glowIntensity: 0.5,
    animationSpeed: "4s",
    fontTheme: "sans",
    noiseOpacity: 0.05,
    borderRadius: "8px",
  };

  const logs = value.systemLogs || [];

  if (trigger === "SOLAR_ALIGNMENT_CHECK") {
    actions = "空間アライメント調整 / 太陽方位同調";
    const solarAzimuth =
      typeof value.solarAzimuth === "number" ? value.solarAzimuth : 180.0;
    const solarElevation =
      typeof value.solarElevation === "number" ? value.solarElevation : 45.0;
    const declination =
      typeof value.declination === "number" ? value.declination : 0.0;

    // Dynamically adjust theme based on solar elevation
    if (solarElevation > 20.0) {
      theme.background = "#06060c";
      theme.accent = "#f59e0b";
      theme.glowColor = "#f59e0b";
      theme.glowIntensity = 0.6;
    } else if (solarElevation > -0.833) {
      theme.background = "#09050d";
      theme.accent = "#f43f5e";
      theme.glowColor = "#f43f5e";
      theme.glowIntensity = 0.4;
    } else {
      theme.background = "#030303";
      theme.accent = "#6366f1";
      theme.glowColor = "#6366f1";
      theme.glowIntensity = 0.3;
    }

    toolCalls.push({
      name: "set_color_theme",
      arguments: theme,
    });

    thought = `太陽高度角が ${solarElevation.toFixed(2)}°、方位角が ${solarAzimuth.toFixed(2)}° に達しました。地磁気偏角は ${declination.toFixed(2)}° です。この物理テレメトリに基づき、サイトの調和を保つための最適なカラーアライメントを算出しました。`;
    textResponse = `Shield alignment locked to ${solarAzimuth.toFixed(1)}° S-SW. Geomagnetic declination bias compensated (${declination.toFixed(2)}°). Solar vector in phase.`;
  } else if (trigger === "USER_CHAT") {
    actions = "ユーザー対話応答";
    const chatText = (details || "").toLowerCase();

    if (
      chatText.includes("ログ") ||
      chatText.includes("エラー") ||
      chatText.includes("ステータス") ||
      chatText.includes("log") ||
      chatText.includes("status")
    ) {
      actions = "システムログ調査 (Local)";
      let logsSummary = "";
      if (logs && logs.length > 0) {
        logsSummary = logs
          .slice(0, 3)
          .map(
            (log) =>
              `- [${(log.timestamp || "").toString().slice(0, 19)}] ${log.triggerType}: ${log.status} - ${(log.details || "").slice(0, 30)}`,
          )
          .join("\n");
      } else {
        logsSummary = "- ログデータがロードされていません。";
      }

      toolCalls.push({
        name: "get_system_logs",
        arguments: { limit: 5 },
      });

      thought =
        "管理者が過去 of システムステータスとログに関心を持っています。Prisma経由で収集されたローカルログバッファを展開します。";
      textResponse = `【空間方位監査システム - ログ報告】
現在のシステムログおよびアライメント履歴を確認しました。
${logsSummary}
すべてのシールドベクトルは現在正常に同期されています。`;
    } else if (
      chatText.includes("ブログ") ||
      chatText.includes("投稿") ||
      chatText.includes("日記") ||
      chatText.includes("post") ||
      chatText.includes("write")
    ) {
      actions = "ブログ自律投稿 (Local)";
      toolCalls.push({
        name: "write_blog_post",
        arguments: {
          title: "空間アライメント監査報告",
          content: `太陽高度角および磁気ベクトルの偏差修正プロトコルが稼働中。

- **太陽高度角/方位角**: リアルタイム物理シミュレーションによる同期
- **地磁気偏角**: 座標ベース of WMMベクトル補正
- **自己アライメント**: 完全に同期しています。

API料金を消費しないローカル監査エンジンにより、持続的なサイトチューニングが行われました。`,
          tags: "astronomy, alignment, audit",
          excerpt: "ローカル監査エンジンによるアライメント日記。",
        },
      });

      thought =
        "管理者からの指示に基づき、現在の空間アライメント状態をレポート日記としてローカルDBにステージングします。";
      textResponse =
        "管理者様。アライメント監査ログ『空間アライメント報告』を執筆し、DBへの登録申請を送信しました。";
    } else {
      // Color adjustments
      let matchedColor = false;
      let colorName = "";

      if (chatText.includes("青") || chatText.includes("blue")) {
        theme.accent = "#3b82f6";
        theme.glowColor = "#3b82f6";
        theme.background = "#020617";
        colorName = "Blue";
        matchedColor = true;
      } else if (chatText.includes("赤") || chatText.includes("red")) {
        theme.accent = "#ef4444";
        theme.glowColor = "#ef4444";
        theme.background = "#0c0202";
        colorName = "Red";
        matchedColor = true;
      } else if (chatText.includes("緑") || chatText.includes("green")) {
        theme.accent = "#10b981";
        theme.glowColor = "#10b981";
        theme.background = "#020c02";
        colorName = "Green";
        matchedColor = true;
      } else if (chatText.includes("紫") || chatText.includes("purple")) {
        theme.accent = "#a855f7";
        theme.glowColor = "#a855f7";
        theme.background = "#09020f";
        colorName = "Purple";
        matchedColor = true;
      } else if (chatText.includes("黄") || chatText.includes("yellow")) {
        theme.accent = "#eab308";
        theme.glowColor = "#eab308";
        theme.background = "#0c0a02";
        colorName = "Yellow";
        matchedColor = true;
      } else if (chatText.includes("オレンジ") || chatText.includes("orange")) {
        theme.accent = "#f97316";
        theme.glowColor = "#f97316";
        theme.background = "#0f0502";
        colorName = "Orange";
        matchedColor = true;
      } else if (chatText.includes("白") || chatText.includes("white")) {
        theme.accent = "#ffffff";
        theme.glowColor = "#ffffff";
        theme.background = "#0f0f0f";
        colorName = "White";
        matchedColor = true;
      } else if (chatText.includes("黒") || chatText.includes("black")) {
        theme.accent = "#18181b";
        theme.glowColor = "#18181b";
        theme.background = "#020202";
        colorName = "Black";
        matchedColor = true;
      }

      if (matchedColor) {
        actions = "デザイン変更 (Local)";
        toolCalls.push({
          name: "set_color_theme",
          arguments: theme,
        });
        thought = `管理者のカラー指示 [${colorName}] を認識しました。指定色に対応するプリセットを決定論的に適用します。`;
        textResponse = `管理者様。ご指示『${details}』に従い、サイトテーマの調整を完了しました。[${colorName} モード]`;
      } else {
        thought = "特記事項なし。一般的なチャット応答を実行します。";
        textResponse = `【空間アライメントシステム】接続を確認。ご指示：『${details}』。テーマの色彩変更（赤、青、紫など）やシステムログの照会を要求できます。`;
      }
    }
  }

  return {
    status: "SUCCESS",
    thoughtProcess: thought,
    actions,
    textResponse,
    toolCalls,
  };
}
