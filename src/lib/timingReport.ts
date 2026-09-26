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
 * **この端末だけ**（localStorage）。生年月日から出た結果なので、
 * 「すべて消す」の対象（ACCOUNT_LOCAL_KEYS）に入れる。クラウドに残す
 * かは利用者の判断を待っている（新しい個人データの保存になるため）。
 *
 * ここは重い依存（暦エンジン）を読まない。段階の名前・星の名前は
 * 呼ぶ側が渡す。
 */

export const SAVED_ANALYSES_KEY = "saved_analyses_v1";
/** 端末に残す件数の上限。古いものから落とす。 */
export const SAVED_ANALYSES_MAX = 20;
export const MCP_URL = "https://cloud-palette.com/api/mcp";

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

function jstDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** 表の 1 セルに入れる文字列から、表を壊す記号を除く。 */
function cell(v: string): string {
  return v.replace(/\|/g, "／").replace(/\n/g, " ");
}

/** 分析を Markdown にする。 */
export function buildTimingReport(input: TimingReportInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}（Cloud Palette）`);
  lines.push("");
  lines.push(`- 作成日: ${jstDate(input.generatedAt)}（日本時間）`);
  if (input.honmeiStarName) lines.push(`- 本命星: ${input.honmeiStarName}`);
  if (input.voidZodiacs && input.voidZodiacs.length > 0)
    lines.push(`- 空亡（天中殺）: ${input.voidZodiacs.join("")}`);
  lines.push(`- 範囲: ${input.range.from} 〜 ${input.range.to}`);
  for (const c of input.conditions) lines.push(`- ${c}`);
  lines.push("");
  lines.push("## 方位ごとの最良の段階と、次に動ける日");
  lines.push("");
  lines.push(
    "| 方位 | 最良の段階 | 次に動ける日 | その段階の日数 | まとまり（回数・平均日数・間隔） |",
  );
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of input.directions) {
    const w = r.windows
      ? `${r.windows.count} 回・${r.windows.avgLen} 日・${
          r.windows.avgGapDays === null ? "—" : `${r.windows.avgGapDays} 日`
        }`
      : "—";
    lines.push(
      `| ${cell(r.label)} | ${cell(r.bestTier ?? "動ける日なし")} | ${
        r.firstDate ?? "—"
      } | ${r.totalOpen} | ${w} |`,
    );
  }
  lines.push("");
  lines.push("## 読み方");
  lines.push("");
  lines.push(
    "段階は九星気学の年盤・月盤・日盤を重ねたもので、S（三盤吉）が最もよく、X（五大凶殺）は避ける日です。効果を保証するものではなく、流派によって扱いが異なります。",
  );
  lines.push("");
  lines.push("## AI で続きを調べるとき");
  lines.push("");
  lines.push(
    `この文書には生年月日と住所（座標）を入れていません。AI に日付や方位を計算し直させるときは、Cloud Palette の MCP（${MCP_URL}）を AI 側に登録し、生年月日と出発地はご自身で伝えてください。本命星・日取り・方位の吉凶を同じ計算で返します。`,
  );
  lines.push("");
  lines.push(`出典: ${input.sourcePath}`);
  return lines.join("\n");
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
