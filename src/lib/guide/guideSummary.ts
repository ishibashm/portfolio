import {
  directionLabelName,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";
import { isAuspiciousStatus } from "@/utils/noiseSeverity";
import type { GuideFacts } from "./guideRun";
import { verifySentences, type VerifySentencesResult } from "./guideVerify";

export type GuideSummaryResult = VerifySentencesResult & {
  sentences: string[];
};

/**
 * facts から定型文の要約（3〜5文）を組み立て、最後に verifySentences で照合する。
 * 数値・日付・名前・URL はすべて道具の出力（facts）の値をそのまま使う。
 */
export function buildGuideSummary(
  facts: GuideFacts,
  evidence: ReadonlySet<string>,
): GuideSummaryResult {
  const raw: string[] = [];

  if (
    facts.municipalityCandidates &&
    facts.municipalityCandidates.length > 1 &&
    !facts.origin
  ) {
    raw.push("出発地の候補が複数あるため、下の候補から選んでください。");
    const first = facts.municipalityCandidates[0];
    raw.push(
      `候補には「${first.name}」（コード${first.code}）などがあります。`,
    );
    if (facts.municipalityCandidates[1]) {
      const second = facts.municipalityCandidates[1];
      raw.push(
        `あわせて「${second.name}」（コード${second.code}）も選べます。`,
      );
    }
    raw.push("吉凶は九星気学の考え方による参考情報です。");
  } else {
    if (facts.origin) {
      raw.push(
        `${facts.birthDate ? `生年月日${facts.birthDate}、` : ""}出発地「${facts.origin.name}」（コード${facts.origin.code}）で判定しました。`,
      );
    }

    if (facts.honmeiCandidates) {
      raw.push(
        `${facts.birthYear !== undefined ? `${facts.birthYear}年の` : ""}本命星の候補は立春前が${facts.honmeiCandidates.beforeSetsubun}、立春後が${facts.honmeiCandidates.afterSetsubun}です。`,
      );
      if (facts.usedAfterSetsubunCandidate) {
        raw.push(
          "立春前後の指定がないため、今日の吉方位は立春後の候補で表示しています。",
        );
      }
    } else if (facts.honmeiStar !== undefined) {
      raw.push(
        `${facts.birthYear !== undefined ? `${facts.birthYear}年の` : ""}本命星は${facts.honmeiStar}です。`,
      );
    }

    if (facts.todayDirections) {
      const td = facts.todayDirections;
      if (td.lucky.length > 0) {
        raw.push(
          `${td.date}の「${td.starName}」の吉方位は${td.lucky.join("・")}です。`,
        );
      } else {
        raw.push(`${td.date}の「${td.starName}」は吉方位がありません。`);
      }
      if (td.unlucky.length > 0) {
        raw.push(
          `${td.date}の凶方位は${td.unlucky.map((u) => `「${u}」`).join("・")}です。`,
        );
      } else if (td.neutral.length > 0) {
        raw.push(`${td.date}の平の方位は${td.neutral.join("・")}です。`);
      }
    } else if (facts.directions.length > 0) {
      const good = facts.directions.filter((d) => isAuspiciousStatus(d.status));
      const when = facts.judgedDate ? `${facts.judgedDate}に` : "";
      if (good.length > 0) {
        raw.push(
          `${when}吉とされる方位は${good.map((d) => d.label).join("・")}です。`,
        );
      } else {
        raw.push("この条件では吉方位がありません。");
      }
      const bad = facts.directions
        .filter((d) => d.status.startsWith("NOISE_"))
        .slice(0, 3)
        .map((d) =>
          isKnownDirectionStatus(d.status)
            ? // 「歳破/月破/日破」はどの盤の破か状態コードだけでは分からないので「破」と書く。
              `${d.label}（${directionLabelName(d.status).includes("/") ? "破" : directionLabelName(d.status)}）`
            : d.label,
        );
      if (bad.length > 0) {
        raw.push(`避けるとされる方位は${bad.join("、")}などです。`);
      }
    }

    if (facts.auspiciousDays.length > 0) {
      const days = facts.auspiciousDays
        .slice(0, 3)
        .map((d) => `${d.date}（${d.label}）`);
      raw.push(`日取りの候補には${days.join("、")}があります。`);
    } else if (facts.origin) {
      raw.push("取得した範囲では吉日の候補はありませんでした。");
    }

    if (facts.towns.length > 0 && raw.length < 4) {
      const towns = facts.towns.slice(0, 3).map((t) => `「${t.name}」`);
      raw.push(`周辺の街には${towns.join("、")}があります。`);
    }

    if (facts.articles.length > 0 && raw.length < 4) {
      const a0 = facts.articles[0];
      raw.push(`参考記事として「${a0.title}」（${a0.url}）が確認できます。`);
      if (facts.articles.length > 1 && raw.length < 4) {
        const a1 = facts.articles[1];
        raw.push(`あわせて「${a1.title}」（${a1.url}）も参照できます。`);
      }
      if (facts.articles.length > 2 && raw.length < 4) {
        const a2 = facts.articles[2];
        raw.push(`ほかに「${a2.title}」もあります。`);
      }
    }

    if (raw.length === 0) {
      raw.push("条件に合う候補は見つかりませんでした。");
    }
    if (raw.length < 5) {
      raw.push("吉凶は九星気学の考え方による参考情報です。");
    }
  }

  const trimmed = raw.slice(0, 5);
  const verified = verifySentences(trimmed, evidence);
  return {
    ...verified,
    sentences: verified.kept,
  };
}
