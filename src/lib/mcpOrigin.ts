/**
 * 公開 MCP の方位道具で、市区町村名またはコードから出発地の経度を決める。
 * 判定の式は変えない。経度が既に渡されていれば、それをそのまま使う。
 */
import { AREAS, findArea, type Area } from "@/lib/areaContent";
import {
  municipalityMatches,
  municipalitySearchKey,
} from "@/lib/municipalitySearch";

export type McpOriginCandidate = {
  code: string;
  name: string;
  pref: string;
  lon: number;
  lat: number;
};

export type McpOriginInput = {
  lon?: number;
  municipalityCode?: string;
  municipalityName?: string;
};

export type McpOriginResolution =
  | {
      ok: true;
      lon: number;
      origin?: McpOriginCandidate;
    }
  | { ok: false; error: string }
  | {
      ok: false;
      needsSelection: true;
      message: string;
      candidates: McpOriginCandidate[];
    };

const CODE_RE = /^\d{5}$/;

function asCandidate(area: Area): McpOriginCandidate {
  return {
    code: area.code,
    name: area.full,
    pref: area.pref,
    lon: area.lon,
    lat: area.lat,
  };
}

function okFromArea(area: Area): McpOriginResolution {
  return { ok: true, lon: area.lon, origin: asCandidate(area) };
}

function candidatesOf(areas: Area[], query: string): McpOriginResolution {
  const candidates = areas.slice(0, 10).map(asCandidate);
  return {
    ok: false,
    needsSelection: true,
    message: `「${query}」に一致する市区町村が複数あります。municipalityCode（5桁）で選んでください。`,
    candidates,
  };
}

/** 名前から候補を探す。search_municipality と同じ照合。 */
export function searchMunicipalityAreas(query: string): Area[] {
  const q = query.trim();
  if (!q) return [];
  return AREAS.filter((a) => municipalityMatches(a, q)).sort(
    (a, b) => b.count - a.count,
  );
}

/**
 * lon があればそれを使う。無ければ市区町村コード、次に名前。
 * 名前が複数に当たれば候補を返し、判定はしない。
 */
export function resolveMcpOrigin(input: McpOriginInput): McpOriginResolution {
  if (typeof input.lon === "number" && Number.isFinite(input.lon)) {
    if (input.lon < 122 || input.lon > 154) {
      return { ok: false, error: "lon は122〜154の数値で指定してください。" };
    }
    return { ok: true, lon: input.lon };
  }
  if (input.municipalityCode) {
    if (!CODE_RE.test(input.municipalityCode)) {
      return {
        ok: false,
        error: "municipalityCode は5桁の市区町村コードで指定してください。",
      };
    }
    const area = findArea(input.municipalityCode);
    if (!area) {
      return {
        ok: false,
        error: `コード ${input.municipalityCode} の市区町村は掲載の集計がありません。search_municipality で確かめてください。`,
      };
    }
    return okFromArea(area);
  }
  const name = input.municipalityName?.trim();
  if (name) {
    return resolveByName(name);
  }
  return {
    ok: false,
    error:
      "出発地は lon、municipalityCode、municipalityName のいずれかで指定してください。",
  };
}

function resolveByName(name: string): McpOriginResolution {
  const hits = searchMunicipalityAreas(name);
  if (hits.length === 0) {
    return {
      ok: false,
      error: `「${name}」に一致する市区町村が見つかりません。search_municipality で確かめてください。`,
    };
  }
  const key = municipalitySearchKey(name);
  const exact = hits.filter(
    (a) =>
      municipalitySearchKey(a.full) === key ||
      municipalitySearchKey(a.city) === key,
  );
  if (exact.length === 1) return okFromArea(exact[0]);
  if (exact.length > 1) return candidatesOf(exact, name);
  if (hits.length === 1) return okFromArea(hits[0]);
  return candidatesOf(hits, name);
}

export function isOriginSelection(
  value: McpOriginResolution,
): value is Extract<McpOriginResolution, { needsSelection: true }> {
  return !value.ok && "needsSelection" in value && value.needsSelection;
}
