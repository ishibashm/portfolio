import { analyzeRepo } from "./analyze";
import { collectRepo } from "./collect";
import { fetchOwnSite } from "./live";
import { draftNarrative } from "./llm";
import { composeNarrative } from "./report";
import { assertReportSafe, redactValue } from "./safety";
import type {
  Finding,
  GrowthConfig,
  GrowthReport,
  LiveSnapshot,
} from "./types";

export interface RunInput {
  root: string;
  config: GrowthConfig;
  now: string;
  live: boolean;
  previousFindings?: Finding[] | null;
  fetchImpl?: typeof fetch;
}

function diffFindings(previous: Finding[] | null, next: Finding[]) {
  if (!previous) {
    return {
      hasPrevious: false,
      added: [] as string[],
      removed: [] as string[],
      unchanged: 0,
    };
  }
  const before = new Set(previous.map((row) => row.id));
  const after = new Set(next.map((row) => row.id));
  return {
    hasPrevious: true,
    added: next.filter((row) => !before.has(row.id)).map((row) => row.id),
    removed: [...before].filter((id) => !after.has(id)),
    unchanged: next.filter((row) => before.has(row.id)).length,
  };
}

export async function runGrowthPipeline(
  input: RunInput,
): Promise<GrowthReport> {
  const facts = collectRepo(input.root);
  const live: LiveSnapshot = input.live
    ? await fetchOwnSite(input.config, { fetchImpl: input.fetchImpl })
    : { attempted: false, probes: [] };
  const analyzed = analyzeRepo(facts, live, input.config);
  const base: GrowthReport = {
    version: 1,
    generatedAt: input.now,
    siteUrl: input.config.siteUrl,
    provider: input.config.provider,
    merge: false,
    deploy: false,
    facts,
    live,
    diff: diffFindings(input.previousFindings ?? null, analyzed.findings),
    narrative: "",
    llmNote: "",
    ...analyzed,
  };
  base.narrative = composeNarrative(base);
  const prompt = [
    "次の監査メモを、日本語で 400 字以内にまとめて。",
    "新しい数値や相場を作らない。マージやデプロイを提案しない。個人の生年月日や座標を書かない。",
    base.narrative,
    ...base.backlog.slice(0, 5).map((row) => row.title),
  ].join("\n");
  const llm = await draftNarrative(input.config, prompt);
  base.llmNote = llm.note;
  if (llm.text)
    base.narrative = `${base.narrative}\n\n（モデルの下書き）${llm.text}`;
  const safe = redactValue(base);
  safe.merge = false;
  safe.deploy = false;
  assertReportSafe(safe);
  return safe;
}

export function previousFindingsFromJson(raw: string | null): Finding[] | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { findings?: Finding[] };
  if (!Array.isArray(parsed.findings)) return null;
  return parsed.findings;
}
