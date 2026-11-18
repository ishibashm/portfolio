/**
 * 引越しできる日の一覧（/houi/relocation-calendar）の出発地を決める。
 *
 * ## なぜ要るか（利用者の指摘、2026-11-15）
 *
 * 「経度指定するんだけど、面倒」。これまでは出発地の経度（122〜154）を
 * 数値で打つしかなかった。市区町村名（例：名古屋市中川区）で入れられる
 * ようにし、経度は「詳しく指定」に残す。
 *
 * 照合は公開 MCP と同じ resolveMcpOrigin（lib/mcpOrigin）を使い、
 * 判定の式は変えない。ここは頁向けの言葉に直すだけ。
 *
 * 優先順は **市区町村コード → 市区町村名 → 経度**。候補から選んだ
 * （code）、または名前を打った人の意図を、フォームに残っていた経度より
 * 先に扱う。経度だけの旧い URL はそのまま動く。
 */
import {
  isOriginSelection,
  resolveMcpOrigin,
  type McpOriginCandidate,
} from "@/lib/mcpOrigin";

export type RelocationOriginQuery = {
  code?: string;
  place?: string;
  lon?: string;
};

export type RelocationOrigin =
  | { kind: "ok"; lon: number; place?: McpOriginCandidate }
  | { kind: "ambiguous"; query: string; candidates: McpOriginCandidate[] }
  | { kind: "error"; message: string };

const LIST_HINT =
  "県名から（例：愛知県名古屋市中川区）入れるか、近くの市区町村名を試してください。見つからないときは「経度で詳しく指定」から経度を入れられます。";

export function resolveRelocationOrigin(
  query: RelocationOriginQuery,
): RelocationOrigin {
  const code = query.code?.trim();
  const place = query.place?.trim();
  const lonText = query.lon?.trim();

  if (code) {
    const r = resolveMcpOrigin({ municipalityCode: code });
    if (r.ok) return { kind: "ok", lon: r.lon, place: r.origin };
    return {
      kind: "error",
      message: `選んだ市区町村が見つかりませんでした。${LIST_HINT}`,
    };
  }

  if (place) {
    if (place.length > 80) {
      return { kind: "error", message: `市区町村名が長すぎます。${LIST_HINT}` };
    }
    const r = resolveMcpOrigin({ municipalityName: place });
    if (r.ok) return { kind: "ok", lon: r.lon, place: r.origin };
    if (isOriginSelection(r)) {
      return { kind: "ambiguous", query: place, candidates: r.candidates };
    }
    return {
      kind: "error",
      message: `「${place}」に当てはまる市区町村が見つかりませんでした。${LIST_HINT}`,
    };
  }

  if (lonText) {
    const lon = Number(lonText);
    const r = resolveMcpOrigin({ lon });
    if (r.ok) return { kind: "ok", lon: r.lon };
    return {
      kind: "error",
      message: "経度は122〜154の数値で入れてください。",
    };
  }

  return {
    kind: "error",
    message: "今住んでいる市区町村を入れてください。",
  };
}
