/**
 * `/api/v1/analyzer/process`（FastAPI 側）の応答。
 *
 * 同じ口を **2 つのウィジェットが叩いている**（`DataAnalyzerWidget` と
 * `OmniPipelineWidget`）。型は `DataAnalyzerWidget` の中にだけ private で
 * 置かれていて、もう一方は `any` のままだった。**同じ応答に 2 通りの扱いが
 * ある状態**だったので、ここへ出して両方から使う（CLAUDE.md 3 節
 * 「同じことを 2 か所に書かない」）。
 *
 * 応答の全体を型にはしない。**この 2 画面が実際に読む枝だけ**を写している
 * （外部 JSON の扱いは CLAUDE.md 4 節。#149 の `Building` / `RoomEntry`、
 * #151 の `NiftyBukken` と同じ方針）。
 */

/** 解析された 1 ポスト。どの欄も揃わないことがあるので、すべて任意。 */
export interface AnalyzerPost {
  text?: string;
  author_handle?: string;
  created_at?: string;
  timestamp?: string;
  media_paths?: string[];
}

/**
 * 解析の結果。
 *
 * `category` で下の表示が切り替わる（finance / vision / markdown / general と、
 * 画面側が自分で入れる unknown）。応答側の値を union で固定すると増えたときに
 * 落ちるので、ここでは string のまま扱う。
 *
 * **`keywords` と `posts` は任意。**分類によっては返ってこない。描く側は
 * 必ず有無を見ること（`OmniPipelineWidget` が見ておらず、返ってこない応答で
 * 描画が落ちていた）。
 */
export interface AnalyzerResult {
  category: string;
  summary: string;
  keywords?: string[];
  posts?: AnalyzerPost[];
  items?: string[];
}
