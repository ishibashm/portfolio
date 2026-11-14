/**
 * 時期の分析を「残す」「AI に渡す」ための文書にする（利用者の依頼、
 * 2026-09-26）。
 *
 *     どちらも引越し時期を分析したあと、それを保存できたらいい。
 *     分析後それを MCP を通して LLM に分析させられるようにしたい
 *
 * ## 何を書くか
 *
 * 画面が出した**結論だけ**を Markdown にする（方位ごとの最良の段階・
 * 次に動ける日・該当日数・まとまり方）。AI に貼っても、そのまま人が
 * 読んでも意味が通る形にする。
 *
 * **生年月日と座標は書かない。**書くのは本命星と空亡まで。貼る先の
 * AI に何を渡すかは本人が決めることで、こちらが勝手に詰め込まない。
 * 続きを AI に計算させたいときは、サイトの MCP（/api/mcp）を AI 側に
 * 登録してもらい、生年月日は本人が AI に伝える。
 *
 * ## どこに残すか
 *
 * この端末（localStorage）と、ログイン中ならアカウント（/api/saved-analyses。
 * 表は saved_analyses。利用者の判断、2026-09-26）。生年月日から出た結果
 * なので、どちらも「すべて消す」の対象（端末は ACCOUNT_LOCAL_KEYS、
 * アカウントは /api/user-config の DELETE）。
 *
 * ここは重い依存（暦エンジン）を読まない。段階の名前・星の名前は
 * 呼ぶ側が渡す。
 */

import { buildAiExportDocument } from "@/lib/aiExport";

export { MCP_URL } from "@/lib/aiExport";

export const SAVED_ANALYSES_KEY = "saved_analyses_v1";
/** 端末に残す件数の上限。古いものから落とす。 */
export const SAVED_ANALYSES_MAX = 20;
export interface ReportDirectionRow {
  /** 方位の表示名（北・北東…） */
  label: string;
  /** 最良の段階の表示（「S 三盤吉」など）。無ければ null */
  bestTier: string | null;
  /** その段階で次に動ける日（YYYY-MM-DD） */
  firstDate: string | null;
  /** その段階の日数（範囲の未来ぶん） */
  totalOpen: number;
  /** 連続したまとまり。無ければ null */
  windows: { count: number; avgLen: number; avgGapDays: number | null } | null;
}

export interface TimingReportInput {
  /** 見出し（「引越し時期の全期間分析」など） */
  title: string;
  /** 作った時刻 */
  generatedAt: Date;
  /** 本命星の番号（1〜9）。分からなければ省く */
  honmeiStar?: number;
  /** 本命星の名前（「七赤金星」）。分からなければ省く */
  honmeiStarName?: string;
  /** 空亡の十二支（["辰", "巳"]） */
  voidZodiacs?: string[];
  /** 走査の範囲 */
  range: { from: string; to: string };
  /** 前提の箇条書き（盤・天中殺の扱い・同行者など） */
  conditions: string[];
  directions: ReportDirectionRow[];
  /** 作った頁の URL（相対でよい） */
  sourcePath: string;
}

/** 表の 1 セルに入れる文字列から、表を壊す記号を除く。 */
function cell(v: string): string {
  return v.replace(/\|/g, "／").replace(/\n/g, " ");
}

/** 分析を Markdown にする。共通の書き出しに、時期分析の表を載せる。 */
export function buildTimingReport(input: TimingReportInput): string {
  const table = [
    "| 方位 | 最良の段階 | 次に動ける日 | その段階の日数 | まとまり（回数・平均日数・間隔） |",
    "| --- | --- | --- | --- | --- |",
    ...input.directions.map((r) => {
      const w = r.windows
        ? `${r.windows.count} 回・${r.windows.avgLen} 日・${
            r.windows.avgGapDays === null ? "—" : `${r.windows.avgGapDays} 日`
          }`
        : "—";
      return `| ${cell(r.label)} | ${cell(r.bestTier ?? "動ける日なし")} | ${
        r.firstDate ?? "—"
      } | ${r.totalOpen} | ${w} |`;
    }),
  ].join("\n");
  return buildAiExportDocument({
    title: input.title,
    generatedAt: input.generatedAt,
    honmeiStar: input.honmeiStar,
    honmeiStarName: input.honmeiStarName,
    voidZodiacs: input.voidZodiacs,
    range: input.range,
    conditions: input.conditions,
    sections: [
      { heading: "方位ごとの最良の段階と、次に動ける日", body: table },
      {
        heading: "読み方",
        body: "段階は九星気学の年盤・月盤・日盤を重ねたもので、S（三盤吉）が最もよく、X（五大凶殺）は避ける日です。効果を保証するものではなく、流派によって扱いが異なります。",
      },
    ],
    sourcePath: input.sourcePath,
  });
}

export interface SavedAnalysis {
  id: string;
  /** どの頁で作ったか */
  kind: "timing" | "calendar";
  name: string;
  savedAt: string;
  markdown: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isSaved(v: unknown): v is SavedAnalysis {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.kind === "timing" || o.kind === "calendar") &&
    typeof o.name === "string" &&
    typeof o.savedAt === "string" &&
    typeof o.markdown === "string"
  );
}

/** 端末に残した分析（新しい順）。壊れた項目は捨てる。 */
export function readSavedAnalyses(storage: StorageLike): SavedAnalysis[] {
  try {
    const raw = storage.getItem(SAVED_ANALYSES_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isSaved) : [];
  } catch {
    return [];
  }
}

function writeAll(storage: StorageLike, list: SavedAnalysis[]): boolean {
  try {
    storage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(list));
    return true;
  } catch {
    /* 容量切れ・プライベートモード */
    return false;
  }
}

/** 先頭に足す。上限を超えたら古いものから落とす。書けなければ false。 */
export function saveAnalysis(
  storage: StorageLike,
  entry: Omit<SavedAnalysis, "id" | "savedAt">,
  now: Date = new Date(),
): SavedAnalysis | null {
  const saved: SavedAnalysis = {
    ...entry,
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: now.toISOString(),
  };
  const list = [saved, ...readSavedAnalyses(storage)].slice(
    0,
    SAVED_ANALYSES_MAX,
  );
  return writeAll(storage, list) ? saved : null;
}

export function deleteAnalysis(storage: StorageLike, id: string): void {
  writeAll(
    storage,
    readSavedAnalyses(storage).filter((a) => a.id !== id),
  );
}
