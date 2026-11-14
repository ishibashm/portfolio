/**
 * 画面ごとの「AI に渡す」文書。共通の作り手（aiExport.ts）を呼ぶ。
 * サーバーページ専用。クライアント部品からは読まない
 * （案内の型や期間計算の型を引くため）。
 */
import {
  DEFAULT_AI_FOLLOW_UPS,
  MCP_URL,
  buildAiExportDocument,
  markdownCell as cell,
  publicHonmeiPageUrl,
  publicHonmeiYears,
  yearFromIso,
} from "@/lib/aiExport";
import { currentYearInJapan, STAR_NAMES } from "@/lib/kigakuContent";
import { SITE_URL } from "@/lib/siteUrl";
import type { RelocationWindow } from "@/lib/relocationWindows";
import type { GuideAnswerData } from "@/lib/guide/guidePage";
import { GUIDE_KIND_INFO, GUIDE_TOPICS } from "@/lib/guide/guideForm";
import type { GuideFacts } from "@/lib/guide/guideRun";

type CalendarPayload = {
  from: string;
  to: string;
  days: number;
  windows: RelocationWindow[];
  tripleDays: { date: string; directions: { label: string }[] }[];
  tripleDaysTotal: number;
  summary: {
    totalDays: number;
    windowsCount: number;
    allDirectionsBadDays: number;
    tenchusatsuDays: number;
  };
};

export function buildRelocationCalendarAiExport(opts: {
  payload: CalendarPayload;
  generatedAt: Date;
  honmeiStar?: number;
  honmeiStarName?: string;
  voidZodiacs?: string[];
}): string {
  const { payload } = opts;
  const windowRows = [
    "| 期間 | 日数 | 使える方位と強さ | 天中殺（年/月） |",
    "| --- | --- | --- | --- |",
    ...payload.windows.map((w) => {
      const dirs = w.allDirectionsBad
        ? "全方位凶"
        : w.directions.map((d) => `${d.label} ${d.tier}`).join(" / ");
      const ten = w.tenchusatsu.inPeriod
        ? `${w.tenchusatsu.scopes
            .map((s) => (s === "year" ? "年" : "月"))
            .join("・")}：${w.tenchusatsu.note}${
            w.tenchusatsu.blocks ? " 移転不可" : ""
          }`
        : "—";
      return `| ${cell(`${w.from}〜${w.to}`)} | ${w.days} | ${cell(dirs)} | ${cell(ten)} |`;
    }),
  ].join("\n");

  const triples =
    payload.tripleDays.length === 0
      ? "この期間に該当する日はありません。"
      : [
          `同じ方位で年盤・月盤・日盤すべて吉の日です。全${payload.tripleDaysTotal}日（最大200日表示）。`,
          "",
          ...payload.tripleDays.map(
            (d) =>
              `- ${d.date}：${d.directions.map((v) => v.label).join("・")}`,
          ),
        ].join("\n");

  return buildAiExportDocument({
    title: "引越しできる日の一覧",
    generatedAt: opts.generatedAt,
    honmeiStar: opts.honmeiStar,
    honmeiStarName: opts.honmeiStarName,
    voidZodiacs: opts.voidZodiacs,
    range: { from: payload.from, to: payload.to },
    conditions: [
      `走査日数: ${payload.summary.totalDays}日`,
      `期間の数: ${payload.summary.windowsCount}`,
      `全方位凶: ${payload.summary.allDirectionsBadDays}日`,
      `天中殺: ${payload.summary.tenchusatsuDays}日`,
      "天中殺は年・月だけを見て、既定では吉凶を弱めるだけで禁止しません。",
    ],
    sections: [
      { heading: "期間の一覧", body: windowRows },
      { heading: "3盤そろう日", body: triples },
    ],
    sourcePath: `${SITE_URL}/houi/relocation-calendar`,
    followUpQuestions: [
      "3盤そろう日だけを抜き出し、短い候補リストにしてください。",
      "天中殺の期間を避けたうえで、使える方位が続く日程を整理してください。",
      ...DEFAULT_AI_FOLLOW_UPS.slice(2),
    ],
  });
}

function redactPersonal(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("");
  }
  return out
    .replace(/生年月日\s*[:：]?\s*\d{4}-\d{2}-\d{2}[、,]?/g, "")
    .replace(/(?:緯度|経度)\s*[=:：]?\s*-?\d+(?:\.\d+)?度?/g, "");
}

function secretsFromAnswer(answer: GuideAnswerData): string[] {
  const secrets: string[] = [];
  const { query, facts } = answer;
  if (facts.birthDate) secrets.push(facts.birthDate);
  if (query.kind === "move" && query.b) secrets.push(query.b);
  const origins = [
    facts.origin,
    ...(facts.municipalityCandidates ?? []),
  ].filter(Boolean);
  for (const o of origins) {
    if (!o) continue;
    if (typeof o.lon === "number") {
      secrets.push(String(o.lon));
      secrets.push(o.lon.toFixed(2));
      secrets.push(o.lon.toFixed(4));
    }
    if (typeof o.lat === "number") {
      secrets.push(String(o.lat));
      secrets.push(o.lat.toFixed(2));
      secrets.push(o.lat.toFixed(4));
    }
  }
  return secrets;
}

function factTables(facts: GuideFacts): string {
  const parts: string[] = [];
  if (facts.honmeiStar !== undefined && !facts.honmeiCandidates) {
    parts.push(
      `本命星: ${facts.honmeiStar} ${STAR_NAMES[facts.honmeiStar] ?? ""}`.trim(),
    );
  }
  if (facts.honmeiCandidates) {
    parts.push(
      `本命星の候補: 立春前 ${facts.honmeiCandidates.beforeSetsubun}（${STAR_NAMES[facts.honmeiCandidates.beforeSetsubun] ?? ""}）、立春後 ${facts.honmeiCandidates.afterSetsubun}（${STAR_NAMES[facts.honmeiCandidates.afterSetsubun] ?? ""}）`,
    );
  }
  if (facts.origin) {
    parts.push(
      `出発地: ${facts.origin.name}${facts.origin.code ? `（コード: ${facts.origin.code}）` : ""}`,
    );
  }
  if (facts.judgedDate) {
    parts.push(`判定日: ${facts.judgedDate}`);
  }
  if (facts.todayDirections) {
    const td = facts.todayDirections;
    parts.push(
      [
        `${td.date}の「${td.starName}」`,
        `吉: ${td.lucky.join("・") || "なし"}`,
        `凶: ${td.unlucky.join("・") || "なし"}`,
        `平: ${td.neutral.join("・") || "なし"}`,
      ].join(" / "),
    );
  }
  if (facts.directions.length > 0) {
    parts.push("方位ごとの段階・状態:");
    parts.push("| 方位 | 段階 | 状態 |");
    parts.push("| --- | --- | --- |");
    for (const d of facts.directions) {
      parts.push(
        `| ${cell(d.label)} | ${cell(d.tier ?? "—")} | ${cell(d.status)} |`,
      );
    }
  }
  if (facts.auspiciousDays.length > 0) {
    parts.push("日取りの候補:");
    for (const d of facts.auspiciousDays) {
      parts.push(`- ${d.date} ${d.label}${d.tier ? `（${d.tier}）` : ""}`);
    }
  }
  if (facts.towns.length > 0) {
    parts.push("周辺の街:");
    for (const t of facts.towns) {
      parts.push(`- ${t.name}${t.code ? `（${t.code}）` : ""}`);
    }
  }
  if (facts.articles.length > 0) {
    parts.push("参考記事:");
    for (const a of facts.articles) {
      parts.push(`- ${a.title}${a.url ? `（${a.url}）` : ""}`);
    }
  }
  return parts.join("\n");
}

export function buildAnnaiAiExport(opts: {
  answer: GuideAnswerData;
  generatedAt: Date;
}): string {
  const { answer } = opts;
  const secrets = secretsFromAnswer(answer);
  const { query, facts, trace } = answer;
  const kindTitle = GUIDE_KIND_INFO[query.kind].title;
  const conditions: string[] = [`質問の種類: ${kindTitle}`];
  if (query.kind === "move") {
    conditions.push(`出発地の市区町村: ${query.m}`);
    if (query.c) conditions.push(`市区町村コード: ${query.c}`);
    conditions.push(`走査期間: ${query.p}日間`);
  }
  if (query.kind === "read") {
    conditions.push(`話題: ${GUIDE_TOPICS[query.t].label}`);
  }
  if (facts.origin && !conditions.some((c) => c.includes(facts.origin!.name))) {
    conditions.push(`出発地: ${facts.origin.name}`);
  }

  const conclusion = answer.sentences
    .map((s) => redactPersonal(s, secrets))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join("\n");

  const tools = trace.length
    ? trace.map((t) => `- ${t.tool}${t.ok ? "" : "（失敗）"}`).join("\n")
    : "呼んだ道具はありません。";

  const honmeiStar = facts.honmeiStar;
  const candidates = facts.honmeiCandidates
    ? [
        facts.honmeiCandidates.beforeSetsubun,
        facts.honmeiCandidates.afterSetsubun,
      ]
    : undefined;
  const judgedYear = facts.judgedDate ?? facts.todayDirections?.date;
  const range = judgedYear ? { from: judgedYear, to: judgedYear } : undefined;

  const body = redactPersonal(
    [factTables(facts), answer.aiNote ? `AI要約の状態: ${answer.aiNote}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    secrets,
  );

  return buildAiExportDocument({
    title: `案内役の回答（${kindTitle}）`,
    generatedAt: opts.generatedAt,
    honmeiStar,
    honmeiStarName: facts.honmeiStarName,
    honmeiStarCandidates: candidates,
    range,
    conditions: conditions.map((c) => redactPersonal(c, secrets)),
    sections: [
      {
        heading: "結論",
        body: conclusion || "結論の文はありません。",
      },
      { heading: "道具から得た結果", body: body || "表はありません。" },
      { heading: "根拠として呼んだ道具", body: tools },
    ],
    sourcePath: `${SITE_URL}/annai`,
    followUpQuestions: [
      ...(query.kind === "move"
        ? [
            "日取りの候補から、生活上の都合を考慮して絞る観点を整理してください。",
          ]
        : []),
      ...(query.kind === "today"
        ? [
            "今日の吉方位だけを抜き出し、避けたい方位との使い分けを短くまとめてください。",
          ]
        : []),
      ...DEFAULT_AI_FOLLOW_UPS,
    ],
    publicStarYears: publicHonmeiYears({
      from: range?.from,
      to: range?.to,
      generatedAt: opts.generatedAt,
    }),
  });
}

export type TodayAiExportStar = {
  star: number;
  name: string;
  today: { lucky: string[]; unlucky: string[]; neutral: string[] };
  tomorrow: { lucky: string[]; unlucky: string[] };
};

export function buildTodayAiExport(opts: {
  date: string;
  tomorrow: string;
  stars: TodayAiExportStar[];
  generatedAt: Date;
}): string {
  const list = (items: string[]) => items.join("・") || "なし";
  const rows = [
    "| 本命星 | 今日の吉 | 今日の凶 | 今日の平 | 明日の吉 | 明日の凶 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...opts.stars.map(
      (s) =>
        `| ${cell(s.name)} | ${cell(list(s.today.lucky))} | ${cell(list(s.today.unlucky))} | ${cell(list(s.today.neutral))} | ${cell(list(s.tomorrow.lucky))} | ${cell(list(s.tomorrow.unlucky))} |`,
    ),
  ].join("\n");

  const year = yearFromIso(opts.date) ?? currentYearInJapan(opts.generatedAt);
  const links = opts.stars
    .map((s) => `- ${s.name}: ${publicHonmeiPageUrl(year, s.star)}`)
    .join("\n");

  return buildAiExportDocument({
    title: "今日の吉方位と時間（本命星別の早見表）",
    generatedAt: opts.generatedAt,
    range: { from: opts.date, to: opts.tomorrow },
    conditions: [
      `表示対象日: ${opts.date}（日本時間）`,
      "本命星別の日盤の早見表です。月命星・個人の天中殺は含みません。",
      "時間帯の区切りは東京基準の真太陽時です（座標は載せていません）。",
    ],
    sections: [
      { heading: "本命星別の今日と明日", body: rows },
      {
        heading: "本命星ごとの公開ページ",
        body: `${year}年の年盤・月盤は次のページで確認できます。\n${links}`,
      },
    ],
    sourcePath: `${SITE_URL}/houi/today`,
    followUpQuestions: [
      "自分の本命星だけを抜き出し、今日の動き方を短く整理してください。",
      "明日の予告を踏まえて、今日中に済ませたいことを整理してください。",
      `公開MCP（${MCP_URL}）を登録し、出発地を指定して今日の方位を再計算してください。`,
    ],
    // 早見表は全市なので、共通フッターの「1星の公開ページ」は出さない。
    publicStarYears: [],
  });
}
