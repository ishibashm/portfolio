import { z } from "zod";
import { DIRECTION_LABELS, STAR_NAMES } from "@/lib/kigakuContent";
import { toJapanDateString } from "@/utils/japanDate";
import {
  GUIDE_TOPICS,
  type GuideQueryStep3,
  type GuideSetsubun,
} from "./guideForm";
import {
  assertGuideTool,
  type GuideCaller,
  type GuideToolName,
} from "./guideTools";

export const GUIDE_RUN_LIMITS = {
  callMs: 8000,
  totalMs: 20000,
  maxCalls: 6,
} as const;

export type GuidePlanStep = {
  tool: GuideToolName;
  args: Record<string, unknown>;
  note?: string;
};

export type GuideTraceEntry = {
  id: number;
  tool: GuideToolName;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  durationMs: number;
};

export type GuideMunicipalityCandidate = {
  code: string;
  name: string;
  pref?: string;
  lon: number;
  lat?: number;
};

export type GuideDirectionFact = {
  direction: string;
  label: string;
  tier?: string;
  status: string;
};

export type GuideDayFact = {
  direction?: string;
  label: string;
  date: string;
  tier?: string;
  status?: string;
  rokuyo?: string;
};

export type GuideTownFact = {
  code: string;
  name: string;
  direction?: string;
  directionLabel?: string;
  distanceKm?: number;
  rentPerSqm?: number | null;
};

export type GuideArticleFact = {
  title: string;
  url: string;
  section?: string;
  description?: string;
  snippet?: string;
};

export type GuideFacts = {
  honmeiStar?: number;
  honmeiStarName?: string;
  honmeiCandidates?: {
    beforeSetsubun: number;
    afterSetsubun: number;
  };
  birthYear?: number;
  birthDate?: string;
  usedAfterSetsubunCandidate?: boolean;
  candidateNote?: string;
  origin?: GuideMunicipalityCandidate;
  municipalityCandidates?: GuideMunicipalityCandidate[];
  /** judge_directions が返した判定日（YYYY-MM-DD）。 */
  judgedDate?: string;
  todayDirections?: {
    date: string;
    star: number;
    starName: string;
    lucky: string[];
    unlucky: string[];
    neutral: string[];
  };
  directions: GuideDirectionFact[];
  auspiciousDays: GuideDayFact[];
  towns: GuideTownFact[];
  articles: GuideArticleFact[];
};

export type GuideRunResult = {
  plan: GuidePlanStep[];
  trace: GuideTraceEntry[];
  facts: GuideFacts;
  outputs: unknown[];
  needsMunicipalitySelection: boolean;
};

export type GuideRunOptions = {
  now?: Date;
  callMs?: number;
  totalMs?: number;
  maxCalls?: number;
  signal?: AbortSignal;
};

function honmeiArgs(y: number, s: GuideSetsubun): Record<string, unknown> {
  return {
    birthYear: y,
    ...(s === "unknown" ? {} : { bornBeforeSetsubun: s === "before" }),
  };
}

/**
 * 質問の種類ごとに呼ぶ道具の順番を決める（固定手順）。
 * 本命星が候補2つの場合も get_today_directions は1回だけ呼び、立春後の候補で参照する。
 */
export function planGuide(
  query: GuideQueryStep3,
  now = new Date(),
): GuidePlanStep[] {
  const today = toJapanDateString(now);

  if (query.kind === "honmei") {
    return [
      {
        tool: "get_honmei_star",
        args: honmeiArgs(query.y, query.s),
      },
      {
        tool: "search_articles",
        args: { query: "本命星", limit: 3 },
      },
    ];
  }

  if (query.kind === "today") {
    return [
      {
        tool: "get_honmei_star",
        args: honmeiArgs(query.y, query.s),
      },
      {
        tool: "get_today_directions",
        args: { date: today },
        ...(query.s === "unknown"
          ? {
              note: "本命星が候補2つのときは両方は呼ばず、立春後の候補で参照します。",
            }
          : {}),
      },
    ];
  }

  if (query.kind === "move") {
    return [
      {
        tool: "search_municipality",
        args: { query: query.m, limit: 10 },
      },
      {
        tool: "judge_directions",
        args: { birthDate: query.b, date: today },
      },
      {
        tool: "find_auspicious_days",
        args: {
          birthDate: query.b,
          from: today,
          days: query.p,
          maxDaysPerDirection: 3,
        },
      },
      {
        tool: "area_directions",
        args: {
          ...(query.c ? { code: query.c } : {}),
          perDirection: 2,
        },
      },
    ];
  }

  if (query.kind !== "read") return [];
  const topic = GUIDE_TOPICS[query.t];
  return [
    {
      tool: "search_articles",
      args: { query: topic.query, limit: 5 },
    },
  ];
}

/** checkMcpPublicLimit に渡す JSON-RPC バッチ形式を作る。 */
export function planToJsonRpcBatch(plan: readonly GuidePlanStep[]) {
  return plan.map((step, index) => ({
    jsonrpc: "2.0" as const,
    id: index + 1,
    method: "tools/call" as const,
    params: { name: step.tool },
  }));
}

/** サイト内相対パスまたは https://cloud-palette.com/ で始まるURLのみ許可する。 */
export function isAllowedGuideArticleUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || /[\s<>"'\\]/.test(trimmed)) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }
  if (trimmed.startsWith("https://cloud-palette.com/")) {
    return true;
  }
  return false;
}

const starNumSchema = z.number().int().min(1).max(9);

const honmeiOutputSchema = z
  .object({
    birthYear: z.number().int().optional(),
    birthDate: z.string().optional(),
    honmeiStar: starNumSchema.optional(),
    candidates: z
      .object({
        beforeSetsubun: starNumSchema,
        afterSetsubun: starNumSchema,
      })
      .optional(),
    note: z.string().optional(),
  })
  .refine(
    (data) => data.honmeiStar !== undefined || data.candidates !== undefined,
  );

const municipalityItemSchema = z.object({
  code: z.string().regex(/^\d{5}$/),
  name: z.string().min(1),
  pref: z.string().optional(),
  lon: z.number().min(122).max(154),
  lat: z.number().optional(),
});

const searchMunicipalityOutputSchema = z.object({
  results: z.array(municipalityItemSchema),
});

const judgeDirectionsOutputSchema = z.object({
  date: z.string().optional(),
  honmeiStar: starNumSchema.optional(),
  directions: z.array(
    z.object({
      direction: z.string().optional(),
      label: z.string().min(1),
      tier: z.string().optional(),
      status: z.string().min(1),
    }),
  ),
});

const findAuspiciousDaysOutputSchema = z.object({
  from: z.string().optional(),
  days: z.number().optional(),
  honmeiStar: starNumSchema.optional(),
  directions: z.array(
    z.object({
      direction: z.string().optional(),
      label: z.string().min(1),
      bestDays: z.array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          tier: z.string().optional(),
          status: z.string().optional(),
          rokuyo: z.string().optional(),
        }),
      ),
    }),
  ),
});

const areaDirectionsOutputSchema = z.object({
  origin: z
    .object({
      code: z.string().regex(/^\d{5}$/),
      name: z.string().min(1),
      lon: z.number().optional(),
    })
    .optional(),
  directions: z.array(
    z.object({
      direction: z.string(),
      label: z.string().optional(),
      nearest: z.array(
        z.object({
          code: z.string().regex(/^\d{5}$/),
          name: z.string().min(1),
          distanceKm: z.number().optional(),
          rentPerSqm: z.number().nullable().optional(),
        }),
      ),
    }),
  ),
});

const searchArticlesOutputSchema = z.object({
  articles: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().min(1),
      slug: z.string().optional(),
      section: z.string().optional(),
      description: z.string().optional(),
      snippet: z.string().optional(),
      kind: z.string().optional(),
    }),
  ),
});

const todayDirectionsOutputSchema = z.object({
  date: z.string(),
  stars: z
    .array(
      z.object({
        star: starNumSchema,
        name: z.string().min(1),
        today: z.object({
          lucky: z.array(z.string()),
          unlucky: z.array(z.string()),
          neutral: z.array(z.string()).optional(),
        }),
      }),
    )
    .min(1),
});

export function emptyGuideFacts(): GuideFacts {
  return {
    directions: [],
    auspiciousDays: [],
    towns: [],
    articles: [],
  };
}

/**
 * 計画された道具を順番に呼び、trace と facts を組み立てる。
 * 時間切れや不正な出力は ok:false として trace に残し、例外は外へ投げない。
 */
export async function runGuide(
  query: GuideQueryStep3,
  call: GuideCaller,
  opts: GuideRunOptions = {},
): Promise<GuideRunResult> {
  const now = opts.now ?? new Date();
  const callMs = Math.max(
    1,
    Math.min(opts.callMs ?? GUIDE_RUN_LIMITS.callMs, GUIDE_RUN_LIMITS.callMs),
  );
  const totalMs = Math.max(
    1,
    Math.min(
      opts.totalMs ?? GUIDE_RUN_LIMITS.totalMs,
      GUIDE_RUN_LIMITS.totalMs,
    ),
  );
  const maxCalls = Math.max(
    1,
    Math.min(
      opts.maxCalls ?? GUIDE_RUN_LIMITS.maxCalls,
      GUIDE_RUN_LIMITS.maxCalls,
    ),
  );
  const deadline = Date.now() + totalMs;

  const plan = planGuide(query, now);
  const trace: GuideTraceEntry[] = [];
  const outputs: unknown[] = [];
  const facts: GuideFacts = emptyGuideFacts();

  if (query.kind === "honmei" || query.kind === "today") {
    facts.birthYear = query.y;
  } else if (query.kind === "move") {
    facts.birthDate = query.b;
  }

  async function invoke<T>(
    tool: GuideToolName,
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
    summarize: (parsed: T) => string,
  ): Promise<T | null> {
    assertGuideTool(tool);
    if (trace.length >= maxCalls) {
      return null;
    }
    const started = Date.now();
    const remaining = deadline - started;
    if (remaining <= 0 || opts.signal?.aborted) {
      trace.push({
        id: trace.length + 1,
        tool,
        args,
        ok: false,
        summary: "失敗：全体の時間上限に達したため打ち切りました。",
        durationMs: 0,
      });
      return null;
    }

    const timeout = Math.min(callMs, remaining);
    const callAbort = new AbortController();
    const signals = opts.signal
      ? [opts.signal, callAbort.signal]
      : [callAbort.signal];
    const combined = AbortSignal.any(signals);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    try {
      const rawOutput = await Promise.race([
        call(tool, args, combined, timeout),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error("TIMEOUT"));
          combined.addEventListener("abort", onAbort, { once: true });
          timer = setTimeout(() => {
            callAbort.abort();
            reject(new Error("TIMEOUT"));
          }, timeout);
        }),
      ]);
      const durationMs = Date.now() - started;
      if (combined.aborted || durationMs > timeout + 50) {
        trace.push({
          id: trace.length + 1,
          tool,
          args,
          ok: false,
          summary: "失敗：時間上限を超過しました。",
          durationMs,
        });
        return null;
      }

      const parsed = schema.safeParse(rawOutput);
      if (!parsed.success) {
        trace.push({
          id: trace.length + 1,
          tool,
          args,
          ok: false,
          summary: "失敗：道具の出力形式が想定と異なりました。",
          durationMs,
        });
        return null;
      }

      outputs.push(rawOutput);
      trace.push({
        id: trace.length + 1,
        tool,
        args,
        ok: true,
        summary: summarize(parsed.data),
        durationMs,
      });
      return parsed.data;
    } catch {
      const durationMs = Date.now() - started;
      trace.push({
        id: trace.length + 1,
        tool,
        args,
        ok: false,
        summary: "失敗：道具の呼び出しまたは時間上限で終了しました。",
        durationMs,
      });
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) combined.removeEventListener("abort", onAbort);
    }
  }

  function appendArticles(data: z.infer<typeof searchArticlesOutputSchema>) {
    for (const a of data.articles) {
      if (!isAllowedGuideArticleUrl(a.url)) continue;
      facts.articles.push({
        title: a.title,
        url: a.url.trim(),
        ...(a.section ? { section: a.section } : {}),
        ...(a.description ? { description: a.description } : {}),
        ...(a.snippet ? { snippet: a.snippet } : {}),
      });
    }
  }

  if (query.kind === "honmei") {
    const honmei = await invoke(
      "get_honmei_star",
      plan[0].args,
      honmeiOutputSchema,
      (d) =>
        d.honmeiStar !== undefined
          ? `本命星は${d.honmeiStar}です。`
          : `立春前は${d.candidates!.beforeSetsubun}、立春後は${d.candidates!.afterSetsubun}です。`,
    );
    if (honmei) {
      if (honmei.honmeiStar !== undefined) {
        facts.honmeiStar = honmei.honmeiStar;
        facts.honmeiStarName = STAR_NAMES[honmei.honmeiStar];
      } else if (honmei.candidates) {
        facts.honmeiCandidates = honmei.candidates;
      }
    }

    const articles = await invoke(
      "search_articles",
      plan[1].args,
      searchArticlesOutputSchema,
      (d) => `関連記事${d.articles.length}件を取得しました。`,
    );
    if (articles) {
      appendArticles(articles);
    }

    return {
      plan,
      trace,
      facts,
      outputs,
      needsMunicipalitySelection: false,
    };
  }

  if (query.kind === "today") {
    const honmei = await invoke(
      "get_honmei_star",
      plan[0].args,
      honmeiOutputSchema,
      (d) =>
        d.honmeiStar !== undefined
          ? `本命星は${d.honmeiStar}です。`
          : `立春前は${d.candidates!.beforeSetsubun}、立春後は${d.candidates!.afterSetsubun}です。`,
    );
    let targetStar: number | undefined;
    if (honmei) {
      if (honmei.honmeiStar !== undefined) {
        facts.honmeiStar = honmei.honmeiStar;
        facts.honmeiStarName = STAR_NAMES[honmei.honmeiStar];
        targetStar = honmei.honmeiStar;
      } else if (honmei.candidates) {
        facts.honmeiCandidates = honmei.candidates;
        facts.honmeiStar = honmei.candidates.afterSetsubun;
        facts.honmeiStarName = STAR_NAMES[honmei.candidates.afterSetsubun];
        facts.usedAfterSetsubunCandidate = true;
        facts.candidateNote =
          "立春前後の指定がないため、今日の吉方位は立春後の候補で表示しています。";
        targetStar = honmei.candidates.afterSetsubun;
      }
    }

    const todayDirs = await invoke(
      "get_today_directions",
      plan[1].args,
      todayDirectionsOutputSchema,
      (d) => `${d.date}の日盤（${d.stars.length}星分）を取得しました。`,
    );
    if (todayDirs) {
      const matched =
        (targetStar !== undefined
          ? todayDirs.stars.find((s) => s.star === targetStar)
          : undefined) ?? todayDirs.stars[0];
      if (matched) {
        facts.todayDirections = {
          date: todayDirs.date,
          star: matched.star,
          starName: matched.name,
          lucky: matched.today.lucky,
          unlucky: matched.today.unlucky,
          neutral: matched.today.neutral ?? [],
        };
        for (const label of matched.today.lucky) {
          facts.directions.push({
            direction: label,
            label,
            status: "吉",
          });
        }
        for (const item of matched.today.unlucky) {
          const m = /^(北東|南東|南西|北西|北|東|南|西)（(.+)）$/.exec(item);
          facts.directions.push({
            direction: m ? m[1] : item,
            label: m ? m[1] : item,
            status: m ? m[2] : item,
          });
        }
        for (const label of matched.today.neutral ?? []) {
          facts.directions.push({
            direction: label,
            label,
            status: "平穏",
          });
        }
      }
    }

    return {
      plan,
      trace,
      facts,
      outputs,
      needsMunicipalitySelection: false,
    };
  }

  if (query.kind === "move") {
    const today = toJapanDateString(now);
    const search = await invoke(
      "search_municipality",
      { query: query.m, limit: 10 },
      searchMunicipalityOutputSchema,
      (d) => `${d.results.length}件の市区町村が見つかりました。`,
    );
    if (!search) {
      return {
        plan,
        trace,
        facts,
        outputs,
        needsMunicipalitySelection: false,
      };
    }

    const results = search.results;
    facts.municipalityCandidates = results;

    // c が指定されていれば結果の中にあるコードだけを採用する（結果に無いコードは使わない）
    const selectedByCode = query.c
      ? results.find((r) => r.code === query.c)
      : undefined;
    const origin =
      selectedByCode ?? (results.length === 1 ? results[0] : undefined);

    if (!origin) {
      return {
        plan,
        trace,
        facts,
        outputs,
        needsMunicipalitySelection: results.length > 1,
      };
    }

    facts.origin = origin;

    const judged = await invoke(
      "judge_directions",
      { birthDate: query.b, lon: origin.lon, date: today },
      judgeDirectionsOutputSchema,
      (d) => `${d.directions.length}方位の判定を取得しました。`,
    );
    if (judged) {
      if (judged.date) facts.judgedDate = judged.date;
      if (judged.honmeiStar !== undefined) {
        facts.honmeiStar = judged.honmeiStar;
        facts.honmeiStarName = STAR_NAMES[judged.honmeiStar];
      }
      facts.directions = judged.directions.map((d) => ({
        direction: d.direction ?? d.label,
        label: d.label,
        ...(d.tier ? { tier: d.tier } : {}),
        status: d.status,
      }));
    }

    const auspicious = await invoke(
      "find_auspicious_days",
      {
        birthDate: query.b,
        lon: origin.lon,
        from: today,
        days: query.p,
        maxDaysPerDirection: 3,
      },
      findAuspiciousDaysOutputSchema,
      (d) => {
        const count = d.directions.reduce(
          (sum, dir) => sum + dir.bestDays.length,
          0,
        );
        return `吉日の候補${count}件を取得しました。`;
      },
    );
    if (auspicious) {
      if (
        facts.honmeiStar === undefined &&
        auspicious.honmeiStar !== undefined
      ) {
        facts.honmeiStar = auspicious.honmeiStar;
        facts.honmeiStarName = STAR_NAMES[auspicious.honmeiStar];
      }
      for (const dir of auspicious.directions) {
        for (const day of dir.bestDays) {
          facts.auspiciousDays.push({
            ...(dir.direction ? { direction: dir.direction } : {}),
            label: dir.label,
            date: day.date,
            ...(day.tier ? { tier: day.tier } : {}),
            ...(day.status ? { status: day.status } : {}),
            ...(day.rokuyo ? { rokuyo: day.rokuyo } : {}),
          });
        }
      }
    }

    const area = await invoke(
      "area_directions",
      { code: origin.code, perDirection: 2 },
      areaDirectionsOutputSchema,
      (d) => {
        const count = d.directions.reduce(
          (sum, dir) => sum + dir.nearest.length,
          0,
        );
        return `周辺の街${count}件を取得しました。`;
      },
    );
    if (area) {
      for (const dir of area.directions) {
        const dirLabel =
          dir.label ??
          DIRECTION_LABELS[dir.direction as keyof typeof DIRECTION_LABELS] ??
          dir.direction;
        for (const town of dir.nearest) {
          facts.towns.push({
            code: town.code,
            name: town.name,
            direction: dir.direction,
            directionLabel: dirLabel,
            ...(town.distanceKm !== undefined
              ? { distanceKm: town.distanceKm }
              : {}),
            ...(town.rentPerSqm !== undefined
              ? { rentPerSqm: town.rentPerSqm }
              : {}),
          });
        }
      }
    }

    return {
      plan,
      trace,
      facts,
      outputs,
      needsMunicipalitySelection: false,
    };
  }

  // query.kind === "read"
  const articles = await invoke(
    "search_articles",
    plan[0].args,
    searchArticlesOutputSchema,
    (d) => `記事${d.articles.length}件を取得しました。`,
  );
  if (articles) {
    appendArticles(articles);
  }

  return {
    plan,
    trace,
    facts,
    outputs,
    needsMunicipalitySelection: false,
  };
}
